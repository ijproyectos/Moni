import { useCallback, useEffect, useRef, useState } from 'react'
import { AiError, transcribeAudio } from '../api/aiRepository'
import { joinResults } from '../domain/dictation'
import { isPlusRequired } from '@/shared/lib/errors'
import { OfflineError } from '@/shared/lib/offline'

// Minimal typing of the Web Speech API (not part of lib.dom). Audio never leaves the browser/OS speech
// service: the app only receives the transcript text.
interface RecognitionResultLike {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}
interface RecognitionEventLike {
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike }
}
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionCtor = new () => RecognitionLike

/**
 * Why the dictation did not work: `denied` (microphone permission), `service` (the device's dictation is off or not
 * allowed, typical of iPhone), `no_mic` (no microphone), `network`, `no_speech` (nothing was heard, also used when the
 * server-side fallback could not make out any words), `unsupported` (the browser has no speech recognition),
 * `plus_required` (the server fallback needs Moni Plus) and `quota_exceeded` (today's fallback uses are used up) and
 * `unavailable` (anything else).
 */
export type SpeechError =
  | 'denied'
  | 'service'
  | 'no_mic'
  | 'network'
  | 'no_speech'
  | 'unsupported'
  | 'plus_required'
  | 'quota_exceeded'
  | 'unavailable'

/** MIME types tried in order for the fallback recording; the first one `MediaRecorder` accepts wins. */
const FALLBACK_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'] as const

/** The media type the server (and OpenAI) understands, stripped of any `;codecs=...` suffix. */
function baseMediaType(mimeType: string): string {
  return mimeType.split(';')[0] ?? mimeType
}

function pickFallbackMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const type of FALLBACK_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return null
}

/** True when this browser can record audio for the server-side fallback (Safari on iPhone included). */
export function isFallbackSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    pickFallbackMimeType() !== null
  )
}

/** Longest the fallback records before it stops by itself and sends what it has. */
const FALLBACK_MAX_MS = 20_000

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('unreadable'))
        return
      }
      // "data:audio/webm;base64,AAAA..." — only the part after the comma goes to the server.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('unreadable'))
    reader.readAsDataURL(blob)
  })
}

/** Stops by itself after this long without new speech. */
export const SILENCE_MS = 3000
/** After asking it to stop, how long to wait for the browser's final answer before closing anyway (iOS can skip it). */
const FINISH_MS = 3000

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechSupported(): boolean {
  return getCtor() !== null
}

/** Maps the browser's error code to ours; `aborted` is not an error (it is us stopping). */
export function speechErrorOf(code: string): SpeechError | null {
  switch (code) {
    case 'aborted':
      return null
    case 'not-allowed':
      return 'denied'
    case 'service-not-allowed':
      return 'service'
    case 'audio-capture':
      return 'no_mic'
    case 'network':
      return 'network'
    case 'no-speech':
      return 'no_speech'
    default:
      return 'unavailable'
  }
}

interface Options {
  /** Called with the full transcript so far (final + interim) every time it changes. */
  onTranscript: (text: string) => void
  /** Silence that ends the dictation. Defaults to {@link SILENCE_MS}. */
  silenceMs?: number
}

interface FallbackSession {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  /** True once `stop()`/`cancel()` decided to discard whatever `onstop` is about to deliver. */
  cancelled: boolean
}

export function useSpeechRecognition({ onTranscript, silenceMs = SILENCE_MS }: Options) {
  const [supported] = useState(isSpeechSupported)
  const [listening, setListening] = useState(false)
  /** The microphone is closed and the last words are being recognised. */
  const [processing, setProcessing] = useState(false)
  /** The server-side fallback clip is uploaded and being transcribed (distinct from `processing`, which is the
   *  native recognizer's own brief wrap-up). */
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<SpeechError | null>(null)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const timerRef = useRef<number | null>(null)
  const finishRef = useRef<number | null>(null)
  const fallbackRef = useRef<FallbackSession | null>(null)
  const fallbackTimerRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    if (finishRef.current !== null) window.clearTimeout(finishRef.current)
    timerRef.current = null
    finishRef.current = null
  }, [])

  /** Ends the session for good: nothing it says later is applied (native, fallback recording, or fallback upload). */
  const close = useCallback(() => {
    clearTimers()
    recognitionRef.current = null
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    const session = fallbackRef.current
    fallbackRef.current = null
    session?.stream.getTracks().forEach((track) => track.stop())
    setListening(false)
    setProcessing(false)
    setTranscribing(false)
  }, [clearTimers])

  /** Finishes: the microphone closes and what was heard is kept ("Procesando…" until the browser/server answers). */
  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (recognition) {
      clearTimers()
      setListening(false)
      setProcessing(true)
      recognition.stop()
      finishRef.current = window.setTimeout(() => {
        if (recognitionRef.current === recognition) {
          recognition.abort()
          close()
        }
      }, FINISH_MS)
      return
    }
    const session = fallbackRef.current
    if (!session || session.recorder.state === 'inactive') return
    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
    setListening(false)
    setProcessing(true)
    session.recorder.stop() // -> onstop uploads what was recorded so far
  }, [clearTimers, close])

  /** Cancels: the microphone closes now and nothing more is applied. */
  const cancel = useCallback(() => {
    const recognition = recognitionRef.current
    const session = fallbackRef.current
    if (session) {
      session.cancelled = true
      if (session.recorder.state !== 'inactive') {
        try {
          session.recorder.stop()
        } catch {
          // Already stopping; close() below tears everything down regardless.
        }
      }
    }
    close()
    recognition?.abort()
  }, [close])

  /**
   * Server-side fallback: records a short clip and sends it to transcribe-audio. Only offered when the native
   * recognizer failed or is unsupported (see `canFallback` below) — Moni Plus only, real cost per use.
   */
  const startFallback = useCallback(() => {
    const mimeType = pickFallbackMimeType()
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError('unavailable')
      return
    }
    setError(null)
    setProcessing(false)
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream, { mimeType })
        const session: FallbackSession = { recorder, stream, chunks: [], cancelled: false }
        fallbackRef.current = session
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) session.chunks.push(event.data)
        }
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop())
          if (fallbackTimerRef.current !== null) {
            window.clearTimeout(fallbackTimerRef.current)
            fallbackTimerRef.current = null
          }
          const cancelled = session.cancelled
          if (fallbackRef.current === session) fallbackRef.current = null
          if (cancelled) return
          setProcessing(false)
          setTranscribing(true)
          const blob = new Blob(session.chunks, { type: mimeType })
          blobToBase64(blob)
            .then((base64) => transcribeAudio({ base64, mediaType: baseMediaType(mimeType) }))
            .then((text) => {
              setTranscribing(false)
              onTranscriptRef.current(text)
            })
            .catch((err: unknown) => {
              setTranscribing(false)
              if (err instanceof OfflineError) setError('network')
              else if (isPlusRequired(err)) setError('plus_required')
              else if (err instanceof AiError && err.code === 'ai_quota_exceeded') setError('quota_exceeded')
              else setError('no_speech')
            })
        }
        recorder.start()
        setListening(true)
        fallbackTimerRef.current = window.setTimeout(() => {
          if (fallbackRef.current === session && session.recorder.state !== 'inactive') {
            session.recorder.stop()
          }
        }, FALLBACK_MAX_MS)
      })
      .catch(() => setError('denied'))
  }, [])

  /** Offered only when retrying the native recognizer would not help (it failed outright or does not exist). */
  const canFallback =
    (error === 'no_speech' || error === 'service' || error === 'unsupported') && isFallbackSupported()

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) {
      setError('unsupported')
      return
    }
    recognitionRef.current?.abort()
    clearTimers()
    setError(null)
    setProcessing(false)

    const recognition = new Ctor()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true
    let heard = false
    let failed = false
    const current = () => recognitionRef.current === recognition

    const armSilenceTimer = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        if (current()) stop()
      }, silenceMs)
    }

    recognition.onresult = (event) => {
      if (!current()) return
      const parts: string[] = []
      for (let i = 0; i < event.results.length; i += 1) parts.push(event.results[i]?.[0].transcript ?? '')
      const text = joinResults(parts)
      if (text !== '') heard = true
      onTranscriptRef.current(text)
      // While it is closing ("Procesando…") the silence clock is not armed again.
      if (finishRef.current === null) armSilenceTimer()
    }
    recognition.onerror = (event) => {
      if (!current()) return
      const mapped = speechErrorOf(event.error)
      if (!mapped) return
      failed = true
      setError(mapped)
    }
    recognition.onend = () => {
      if (!current()) return
      // It ended without words and without an error (Safari does this): say that nothing was heard.
      if (!heard && !failed) setError('no_speech')
      close()
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      armSilenceTimer()
    } catch {
      recognitionRef.current = null
      setError('unavailable')
    }
  }, [clearTimers, close, silenceMs, stop])

  const clearError = useCallback(() => setError(null), [])

  // Release the microphone when the sheet closes.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      if (finishRef.current !== null) window.clearTimeout(finishRef.current)
      if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current)
      const recognition = recognitionRef.current
      recognitionRef.current = null
      recognition?.abort()
      const session = fallbackRef.current
      fallbackRef.current = null
      if (session) {
        session.cancelled = true
        session.stream.getTracks().forEach((track) => track.stop())
      }
    },
    [],
  )

  return {
    supported,
    listening,
    processing,
    transcribing,
    error,
    canFallback,
    start,
    startFallback,
    stop,
    cancel,
    clearError,
  }
}
