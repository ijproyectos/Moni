// Supabase Edge Function (Deno): transcribes ONE short voice clip (fallback for when the browser's own
// SpeechRecognition failed or is unsupported — typical of Safari on iPhone / the installed PWA) and returns
// plain text. It NEVER writes anything and NEVER stores the audio: the client treats the text exactly like a
// native dictation result, shown for review before anything is saved.
//
// Security model (mirrors parse-receipt, see docs/DICTADO_POR_VOZ.md):
//   * verify_jwt = true (supabase/config.toml): the gateway rejects calls without a valid user JWT.
//   * The quota RPC runs with the CALLER's token and the anon key, so RLS applies. The service role key is
//     never used here.
//   * consume_ai_quota rejects free-plan users for 'voice_transcription' (added to its feature list by
//     20261217000000_voice_transcription_quota.sql) BEFORE anything is recorded or any model cost is incurred.
//   * The OpenAI call is a plain fetch (no SDK). The key lives only in the OPENAI_API_KEY secret. The key, the
//     audio and the raw response are never logged or returned — only a short error code.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { jsonResponse, readBodyCapped, corsHeaders } from '../_shared/http.ts'
import {
  callOpenAiTranscription,
  classifyQuotaError,
  contentLengthTooLarge,
  isAuthenticatedUserJwt,
  MAX_BODY_BYTES,
  parseAudioRequest,
  pickAllowedOrigin,
  validateTranscription,
} from './lib.ts'

const FEATURE = 'voice_transcription'
// Lower than photo/receipt (30): this is a paid-per-use fallback, not the everyday path.
const DAILY_LIMIT = 20
const MODEL_TIMEOUT_MS = 20_000
const LOG = 'transcribe-audio'

async function handle(req: Request, origin: string | null): Promise<Response> {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' }, origin)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }
  // The gateway already verified the signature; this only rejects non-user tokens (e.g. the anon key).
  if (!isAuthenticatedUserJwt(authHeader.slice('Bearer '.length).trim())) {
    return jsonResponse(401, { error: 'not_authenticated' }, origin)
  }

  if (contentLengthTooLarge(req.headers.get('Content-Length'))) {
    return jsonResponse(413, { error: 'audio_too_large' }, origin)
  }
  const raw = await readBodyCapped(req, MAX_BODY_BYTES)
  if (raw === null) return jsonResponse(413, { error: 'audio_too_large' }, origin)
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: 'invalid_request' }, origin)
  }
  const parsed = parseAudioRequest(body)
  if (!parsed.ok) {
    return jsonResponse(parsed.error === 'audio_too_large' ? 413 : 400, { error: parsed.error }, origin)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!supabaseUrl || !anonKey || !openaiKey) {
    console.error(`${LOG}: missing environment configuration`)
    return jsonResponse(500, { error: 'server_misconfigured' }, origin)
  }

  // The caller's identity: the quota check below is filtered by RLS / runs as this user.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Quota (and the Plus check it already does) first, before any model cost.
  const quota = await supabase.rpc('consume_ai_quota', {
    p_feature: FEATURE,
    p_daily_limit: DAILY_LIMIT,
  })
  if (quota.error) {
    const kind = classifyQuotaError(quota.error)
    if (kind === 'quota_exceeded') return jsonResponse(429, { error: 'ai_quota_exceeded' }, origin)
    if (kind === 'plus_required') return jsonResponse(402, { error: 'plus_required' }, origin)
    if (kind === 'not_authenticated')
      return jsonResponse(401, { error: 'not_authenticated' }, origin)
    console.error(`${LOG}: quota check failed`, quota.error.code)
    return jsonResponse(500, { error: 'server_error' }, origin)
  }

  // From here on the use is charged and is never given back.
  let audioBytes: Uint8Array
  try {
    audioBytes = Uint8Array.from(atob(parsed.audio), (c) => c.charCodeAt(0))
  } catch {
    return jsonResponse(400, { error: 'invalid_audio' }, origin)
  }

  const text = await callOpenAiTranscription(openaiKey, audioBytes, parsed.mediaType, MODEL_TIMEOUT_MS, LOG)
  const validated = validateTranscription(text)
  if (!validated.ok) return jsonResponse(422, { error: validated.error }, origin)
  return jsonResponse(200, { text: validated.text }, origin)
}

Deno.serve(async (req: Request): Promise<Response> => {
  let origin: string | null = null
  try {
    const requestOrigin = req.headers.get('Origin')
    origin = pickAllowedOrigin(requestOrigin, Deno.env.get('ALLOWED_ORIGINS'))
    // A browser request from an origin that is not allowed gets no CORS headers (and a 403).
    if (requestOrigin && !origin) return jsonResponse(403, { error: 'origin_not_allowed' }, null)
    return await handle(req, origin)
  } catch (error) {
    // Log only the error class: never messages that could carry the audio or secrets.
    console.error(`${LOG}: unexpected error`, error instanceof Error ? error.name : 'unknown')
    return jsonResponse(500, { error: 'server_error' }, origin)
  }
})
