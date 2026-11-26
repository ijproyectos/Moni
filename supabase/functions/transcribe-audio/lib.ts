// Pure logic of the transcribe-audio Edge Function. No Deno-specific imports on purpose: Vitest runs this file
// from the Node project. The function NEVER stores the audio; it only returns the transcribed text so the
// client can use it exactly like a native dictation result (review before saving, nothing auto-applied).
//
// Fallback path: the browser's own SpeechRecognition is the default (free, no server round-trip). This function
// only runs when that failed or is unsupported (typical of Safari on iPhone / the installed PWA), and only for
// Moni Plus (consume_ai_quota rejects 'voice_transcription' on the free plan — see the migration that adds it
// to the quota function's feature list).
//
// Generic helpers (JWT role check, origin pick, quota error mapping) are imported from the already deployed
// parse-movements lib so every AI function behaves identically. That file is read, never edited.

import {
  isAuthenticatedUserJwt,
  pickAllowedOrigin,
  classifyQuotaError,
} from '../parse-movements/lib.ts'
import { base64DecodedLength } from '../parse-receipt/lib.ts'

export { isAuthenticatedUserJwt, pickAllowedOrigin, classifyQuotaError, base64DecodedLength }

export const ALLOWED_AUDIO_MEDIA_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
] as const
export type AudioMediaType = (typeof ALLOWED_AUDIO_MEDIA_TYPES)[number]

/** Filename extension OpenAI's transcription API infers the codec from (it does not read Content-Type). */
export const EXTENSION_OF: Record<AudioMediaType, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
}

export const LIMITS = {
  /** Largest accepted DECODED audio clip. The client caps recording at ~20s of compressed speech, well under this. */
  maxAudioBytes: 2_000_000,
  /** Longest transcript kept from the model's response; a runaway response is truncated, not trusted whole. */
  maxTranscriptChars: 2_000,
} as const

/** base64 inflates by 4/3; the rest of the JSON envelope is tiny. */
export const MAX_BODY_BYTES = Math.ceil((LIMITS.maxAudioBytes * 4) / 3) + 1_024

/**
 * True when a Content-Length header value already proves the body is over the cap. A missing or unparsable
 * header returns false: the body reader then enforces the cap while streaming.
 */
export function contentLengthTooLarge(header: string | null, maxBytes = MAX_BODY_BYTES): boolean {
  if (header === null) return false
  const value = Number(header.trim())
  return Number.isFinite(value) && value > maxBytes
}

// ---------------------------------------------------------------------------------------------------------
// Request

export type AudioRequestError = 'invalid_request' | 'invalid_audio' | 'audio_too_large'

export type ParsedAudioRequest =
  | { ok: true; audio: string; mediaType: AudioMediaType }
  | { ok: false; error: AudioRequestError }

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

/** Validates `{ audio: base64 (no data: prefix), mediaType }`. */
export function parseAudioRequest(body: unknown): ParsedAudioRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'invalid_request' }
  }
  const { audio, mediaType } = body as Record<string, unknown>
  if (
    typeof mediaType !== 'string' ||
    !(ALLOWED_AUDIO_MEDIA_TYPES as readonly string[]).includes(mediaType)
  ) {
    return { ok: false, error: 'invalid_audio' }
  }
  if (typeof audio !== 'string' || audio.length === 0) return { ok: false, error: 'invalid_audio' }
  // Cheap length check first so an oversized string never reaches the regex.
  if (audio.length > MAX_BODY_BYTES) return { ok: false, error: 'audio_too_large' }
  if (audio.length % 4 !== 0 || !BASE64_RE.test(audio)) return { ok: false, error: 'invalid_audio' }
  if (base64DecodedLength(audio) > LIMITS.maxAudioBytes) return { ok: false, error: 'audio_too_large' }
  return { ok: true, audio, mediaType: mediaType as AudioMediaType }
}

// ---------------------------------------------------------------------------------------------------------
// OpenAI Whisper call (pure request shaping / response reading; the HTTP call lives in index.ts so this file
// stays import-free of Deno-only globals — only `fetch`/`FormData`/`Blob`, which Vitest's Node runtime also has).

export const OPENAI_TRANSCRIPTION_URL = 'https://api.openai.com/v1/audio/transcriptions'
// Easy to bump later: 'whisper-1' is OpenAI's standard transcription model at the time this was written.
export const OPENAI_MODEL = 'whisper-1'

/**
 * POSTs the audio to OpenAI's transcription endpoint. Returns the transcript text or null on any failure. Only
 * the failure class is logged: never the key, the audio or the raw response body.
 */
export async function callOpenAiTranscription(
  apiKey: string,
  audioBytes: Uint8Array,
  mediaType: AudioMediaType,
  timeoutMs: number,
  logLabel: string,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const form = new FormData()
    const blob = new Blob([audioBytes], { type: mediaType })
    form.append('file', blob, `audio.${EXTENSION_OF[mediaType]}`)
    form.append('model', OPENAI_MODEL)
    form.append('language', 'es')
    const response = await fetch(OPENAI_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })
    if (!response.ok) {
      console.error(`${logLabel}: model call failed`, response.status)
      return null
    }
    const data = (await response.json()) as { text?: unknown }
    return typeof data.text === 'string' ? data.text : null
  } catch (error) {
    console.error(`${logLabel}: model call failed`, error instanceof Error ? error.name : 'unknown')
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------------------------------------
// Output validation

export type TranscribeErrorCode = 'audio_unreadable'

export type TranscribeValidation =
  | { ok: true; text: string }
  | { ok: false; error: TranscribeErrorCode }

/** Never trusts the model's text whole: trims, caps its length, and treats an empty result as "could not hear it". */
export function validateTranscription(text: string | null): TranscribeValidation {
  if (text === null) return { ok: false, error: 'audio_unreadable' }
  const trimmed = text.trim().slice(0, LIMITS.maxTranscriptChars)
  if (trimmed === '') return { ok: false, error: 'audio_unreadable' }
  return { ok: true, text: trimmed }
}
