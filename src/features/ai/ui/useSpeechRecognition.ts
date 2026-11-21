import { useCallback, useEffect, useRef, useState } from 'react'
import { joinResults } from '../domain/dictation'

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
 * allowed, typical of iPhone), `no_mic` (no microphone), `network`, `no_speech` (nothing was heard), `unsupported` (the
 * browser has no speech recognition) and `unavailable` (anything else).
 */
export type SpeechError = 'denied' | 'service' | 'no_mic' | 'network' | 'no_speech' | 'unsupported' | 'unavailable'

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

export function useSpeechRecognition({ onTranscript, silenceMs = SILENCE_MS }: Options) {
  const [supported] = useState(isSpeechSupported)
  const [listening, setListening] = useState(false)
  /** The microphone is closed and the last words are being recognised. */
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<SpeechError | null>(null)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const timerRef = useRef<number | null>(null)
  const finishRef = useRef<number | null>(null)
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

  /** Ends the session for good: nothing it says later is applied. */
  const close = useCallback(() => {
    clearTimers()
    recognitionRef.current = null
    setListening(false)
    setProcessing(false)
  }, [clearTimers])

  /** Finishes: the microphone closes and what was heard is kept ("Procesando…" until the browser answers). */
  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
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
  }, [clearTimers, close])

  /** Cancels: the microphone closes now and nothing more is applied. */
  const cancel = useCallback(() => {
    const recognition = recognitionRef.current
    close()
    recognition?.abort()
  }, [close])

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
      const recognition = recognitionRef.current
      recognitionRef.current = null
      recognition?.abort()
    },
    [],
  )

  return { supported, listening, processing, error, start, stop, cancel, clearError }
}
