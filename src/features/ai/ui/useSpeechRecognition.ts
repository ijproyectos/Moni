import { useCallback, useEffect, useRef, useState } from 'react'

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

export type SpeechError = 'denied' | 'no_speech' | 'unavailable'

/** Stops by itself after this long without new speech. */
export const SILENCE_MS = 3000

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

interface Options {
  /** Called with the full transcript so far (final + interim) every time it changes. */
  onTranscript: (text: string) => void
  /** Silence that ends the dictation. Defaults to {@link SILENCE_MS}. */
  silenceMs?: number
}

export function useSpeechRecognition({ onTranscript, silenceMs = SILENCE_MS }: Options) {
  const [supported] = useState(isSpeechSupported)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<SpeechError | null>(null)
  const recognitionRef = useRef<RecognitionLike | null>(null)
  const timerRef = useRef<number | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    clearTimer()
    recognitionRef.current?.stop()
    setListening(false)
  }, [clearTimer])

  const start = useCallback(() => {
    const Ctor = getCtor()
    if (!Ctor) {
      setError('unavailable')
      return
    }
    recognitionRef.current?.abort()
    clearTimer()
    setError(null)

    const recognition = new Ctor()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true

    const armSilenceTimer = () => {
      clearTimer()
      timerRef.current = window.setTimeout(() => recognition.stop(), silenceMs)
    }

    recognition.onresult = (event) => {
      let text = ''
      for (let i = 0; i < event.results.length; i += 1) {
        text += `${event.results[i]?.[0].transcript ?? ''} `
      }
      onTranscriptRef.current(text.replace(/\s+/g, ' ').trim())
      armSilenceTimer()
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setError('denied')
      else if (event.error === 'no-speech') setError('no_speech')
      else setError('unavailable')
    }
    recognition.onend = () => {
      clearTimer()
      if (recognitionRef.current === recognition) recognitionRef.current = null
      setListening(false)
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
  }, [clearTimer, silenceMs])

  // Release the microphone when the sheet closes.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      recognitionRef.current?.abort()
      recognitionRef.current = null
    },
    [],
  )

  return { supported, listening, error, start, stop }
}
