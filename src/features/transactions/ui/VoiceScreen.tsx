import { Keyboard, Mic, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import mascotUrl from '@/assets/mascot/personaje_carga-por-voz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useParseMovements } from '@/features/ai/api/useParseMovements'
import { toDrafts, warningsNotice, type DraftMovement } from '@/features/ai/domain/draft'
import { useSpeechRecognition, type SpeechError } from '@/features/ai/ui/useSpeechRecognition'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { isPlusRequired, toUserMessage } from '@/shared/lib/errors'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { useModal } from '@/shared/ui/useModal'
import { DraftConfirmation } from './DraftConfirmation'

const SPEECH_MESSAGES: Record<SpeechError, string> = {
  denied: 'No pudimos usar el micrófono. Podés escribirlo acá abajo.',
  no_speech: 'No te escuché. Tocá el micrófono para probar de nuevo o escribilo acá abajo.',
  unavailable: 'El dictado no está disponible ahora. Escribilo acá abajo.',
}

interface VoiceScreenProps {
  onClose: () => void
}

type Step = 'input' | 'confirm'

/**
 * "Por voz": full-screen dictation. Live transcript from the Web Speech API (es-AR) when the browser has it,
 * otherwise (or on demand) a text box. "Listo" sends only the text to parse-movements and shows the shared
 * confirmation list; nothing is saved without the explicit "Guardar" tap, and audio never leaves the device
 * speech service.
 */
export function VoiceScreen({ onClose }: VoiceScreenProps) {
  const { isFree } = usePlus()
  // Free plan: show the upsell instead of the capability (and never start the microphone).
  if (isFree) return <PlusSheet reason="voice" onClose={onClose} />
  return <VoiceCapture onClose={onClose} />
}

function VoiceCapture({ onClose }: VoiceScreenProps) {
  const online = useOnlineStatus()
  const titleId = useId()

  const [step, setStep] = useState<Step>('input')
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const [drafts, setDrafts] = useState<DraftMovement[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  // The server said the plan is Free even though the client thought otherwise.
  const [plusRequired, setPlusRequired] = useState(false)

  const accountsQuery = useAccounts()
  const parse = useParseMovements()
  const speech = useSpeechRecognition({ onTranscript: setText })
  const { supported, start: startSpeech } = speech

  const accounts = accountsQuery.data ?? []
  const voiceMode = supported && !typing && speech.error !== 'denied'
  const busy = parse.isPending

  // Start listening as soon as the screen opens (the menu tap is the user gesture).
  useEffect(() => {
    if (supported) startSpeech()
  }, [supported, startSpeech])

  function submit() {
    const trimmed = text.trim()
    if (trimmed === '' || busy) return
    speech.stop()
    setParseError(null)
    parse.mutate(trimmed, {
      onSuccess: (response) => {
        const next = toDrafts(response, accounts[0]?.id ?? '')
        if (next.length === 0) {
          setParseError(
            'No encontré gastos ni ingresos en lo que dijiste. Probá de nuevo o cargalo a mano.',
          )
          return
        }
        setNotice(warningsNotice(response.warnings))
        setDrafts(next)
        setStep('confirm')
      },
      onError: (error) => {
        if (isPlusRequired(error)) setPlusRequired(true)
        else setParseError(toUserMessage(error))
      },
    })
  }

  function switchToTyping() {
    speech.stop()
    setTyping(true)
  }

  function switchToVoice() {
    setTyping(false)
    setParseError(null)
    speech.start()
  }

  if (plusRequired) return <PlusSheet reason="voice" onClose={onClose} />

  if (step === 'confirm') {
    return (
      <DraftConfirmation
        initialDrafts={drafts}
        notice={notice}
        intro="Esto es lo que entendí. Corregí lo que haga falta: no se guarda nada hasta que lo confirmes."
        onBack={() => setStep('input')}
        onClose={onClose}
      />
    )
  }

  const status = busy
    ? 'Entendiendo lo que dijiste…'
    : speech.listening
      ? 'Escuchando… hablá tranqui.'
      : voiceMode
        ? 'Tocá el micrófono para hablar.'
        : 'Escribilo como te salga.'

  return (
    <FullScreenModal titleId={titleId} onClose={onClose}>
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),16px)]">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-[28px] font-extrabold leading-8">
            Por voz
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-sand text-ink"
          >
            <X aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="relative flex size-44 items-center justify-center">
            {speech.listening && (
              <>
                <span
                  aria-hidden="true"
                  data-testid="listening-pulse"
                  className="absolute inset-0 rounded-full bg-lime/60 motion-safe:animate-ping"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-3 rounded-full bg-lime/40 motion-safe:animate-pulse"
                />
              </>
            )}
            <img src={mascotUrl} alt="" className="relative size-40" />
          </div>
          <p aria-live="polite" className="min-h-6 text-center text-[17px] font-semibold">
            {status}
          </p>
          {voiceMode && (
            <button
              type="button"
              data-autofocus
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Dejar de escuchar' : 'Hablar'}
              disabled={busy}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              className="flex size-16 items-center justify-center rounded-full bg-lime text-forest disabled:opacity-60"
            >
              <Mic
                aria-hidden="true"
                className={cn('size-7', speech.listening && 'text-expense')}
              />
            </button>
          )}
          {speech.error && (
            <p role="alert" className="text-center text-[15px] text-expense">
              {SPEECH_MESSAGES[speech.error]}
            </p>
          )}
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            {voiceMode ? 'Lo que dijiste' : 'Escribilo como te salga'}
          </span>
          <textarea
            value={text}
            maxLength={500}
            rows={4}
            disabled={busy}
            autoFocus={!voiceMode}
            onChange={(e) => setText(e.target.value)}
            placeholder="Gasté 5 lucas en el bondi, 18 en el almuerzo y cobré el sueldo"
            className="w-full resize-none rounded-[18px] border border-sand bg-card p-4 text-[17px] leading-6 text-ink placeholder:text-text-muted"
          />
        </label>
        {parseError && (
          <p role="alert" className="mt-2 text-[15px] font-semibold text-expense">
            {parseError}
          </p>
        )}
        {!online && (
          <p role="status" className="mt-3 text-center text-sm font-semibold text-text-muted">
            {OFFLINE_MESSAGE}
          </p>
        )}

        <div className="mt-auto pt-4">
          <Button variant="dark" disabled={text.trim() === '' || busy || !online} onClick={submit}>
            {busy ? 'Entendiendo…' : 'Listo'}
          </Button>
          {supported && speech.error !== 'denied' && (
            <div className="mt-1 flex justify-center">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={voiceMode ? switchToTyping : switchToVoice}
              >
                {voiceMode ? (
                  <>
                    <Keyboard aria-hidden="true" className="mr-2 size-5" /> Escribir en vez de
                    hablar
                  </>
                ) : (
                  <>
                    <Mic aria-hidden="true" className="mr-2 size-5" /> Hablar en vez de escribir
                  </>
                )}
              </Button>
            </div>
          )}
          <p className="mt-2 text-center text-[14px] leading-5 text-text-muted">
            Podés sumar la fecha si querés: “ayer”, “el lunes”. Antes de guardar, revisás todo.
          </p>
        </div>
      </div>
    </FullScreenModal>
  )
}

/** Full-screen dialog: focus trap, Escape to close, scroll lock and focus restore come from `useModal`. */
function FullScreenModal({
  titleId,
  onClose,
  children,
}: {
  titleId: string
  onClose: () => void
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useModal(panelRef, onClose)
  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas outline-none motion-safe:animate-[fade-in_150ms_ease-out]"
    >
      {children}
    </div>,
    document.body,
  )
}
