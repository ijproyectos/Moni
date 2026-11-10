import { Check, Mic, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useParseMovements } from '@/features/ai/api/useParseMovements'
import { warningsNotice, type DraftMovement } from '@/features/ai/domain/draft'
import {
  isSpeechSupported,
  useSpeechRecognition,
  type SpeechError,
} from '@/features/ai/ui/useSpeechRecognition'
import { useCategories } from '@/features/categories/api/useCategories'
import { usePlus } from '@/features/plus/api/usePlus'
import { PlusSheet } from '@/features/plus/ui/PlusSheet'
import { isPlusRequired, toUserMessage } from '@/shared/lib/errors'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { AudioWave } from '@/shared/ui/AudioWave'
import { cn } from '@/shared/ui/cn'
import { MINT_PILL, WHITE_PILL } from '@/shared/ui/mentaStyles'
import { prepareDrafts } from '../domain/prepareDrafts'
import { DraftConfirmation } from './DraftConfirmation'
import { VoiceFrame } from './VoiceFrame'

/** What the cat says when the microphone does not work: it stays in the conversation, and offers to type. */
const SPEECH_MESSAGES: Record<SpeechError, string> = {
  denied: 'No pude usar el micrófono. Podés escribirme lo que gastaste o cobraste.',
  no_speech: 'No te escuché. ¿Probamos de nuevo o me lo escribís?',
  unavailable: 'El dictado no está disponible ahora. Podés escribirme lo que gastaste o cobraste.',
}

/** Waits this long without new words before it stops by itself: room to think between expenses. */
const PAUSE_MS = 4500

const smallButton = cn(WHITE_PILL, 'min-h-11 px-4 text-[14px] font-semibold')
const mainButton = cn(MINT_PILL, 'h-[52px] text-[16px] font-semibold')
const labelClass = 'text-[13px] font-medium uppercase tracking-[0.12em] text-mint-ink'
const transcriptClass =
  'max-w-[300px] break-words text-center text-[24px] font-medium leading-[1.25] tracking-[-0.02em]'

/** Moni's cat of the voice screens (72px, with its soft shadow). */
function Mascot() {
  return (
    <img
      src={mascotHappy}
      alt=""
      className="size-[72px] rounded-full bg-lilac shadow-[0_8px_20px_rgba(20,50,30,0.3)]"
    />
  )
}

/** The centered block (cat, label, transcript, wave) and, below, the buttons pinned to the bottom. */
function VoiceLayout({ top, bottom }: { top: ReactNode; bottom: ReactNode }) {
  return (
    <>
      <div className="flex flex-col items-center gap-3.5 pt-3.5">{top}</div>
      <div className="mt-auto flex flex-col gap-2.5">{bottom}</div>
    </>
  )
}

/** idle: first screen (or dictating, when the microphone is on) · review: the transcript · editing: the text box. */
type Step = 'idle' | 'review' | 'editing' | 'confirm'

interface VoiceSheetProps {
  onClose: () => void
  /** `text` skips the promo and opens the text box directly ("Escribilo como te salga"). */
  startWith?: 'promo' | 'text'
}

// Screen 016 — Carga por voz. Voice or text -> AI draft -> editable confirmation -> save. Nothing is saved
// without the explicit "Guardar" tap, and only the transcript text (never audio) is sent to the function.
export function VoiceSheet({ onClose, startWith = 'promo' }: VoiceSheetProps) {
  const { isFree } = usePlus()
  // Free plan: show the upsell instead of the capability (and never start the microphone).
  if (isFree) return <PlusSheet reason="voice" onClose={onClose} />
  return <VoiceCapture onClose={onClose} startWith={startWith} />
}

function VoiceCapture({ onClose, startWith = 'promo' }: VoiceSheetProps) {
  const online = useOnlineStatus()
  const [step, setStep] = useState<Step>(
    startWith === 'text' || !isSpeechSupported() ? 'editing' : 'idle',
  )
  /** Where "Cancelar" goes back to from the text box. */
  const [editFrom, setEditFrom] = useState<'idle' | 'review'>('idle')
  const [text, setText] = useState('')
  const [notHeard, setNotHeard] = useState(false)
  const [drafts, setDrafts] = useState<DraftMovement[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  // The server said the plan is Free even though the client thought otherwise.
  const [plusRequired, setPlusRequired] = useState(false)

  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()
  const parse = useParseMovements()
  const speech = useSpeechRecognition({ onTranscript: setText, silenceMs: PAUSE_MS })

  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const dataLoading = accountsQuery.isLoading || categoriesQuery.isLoading
  const busy = parse.isPending
  // An error ends the dictation even before the browser reports that it stopped.
  const listening = speech.listening && speech.error === null

  // The microphone just stopped (by the button or by itself after a silence): show what was heard, or say nothing was.
  const [wasListening, setWasListening] = useState(false)
  if (listening !== wasListening) {
    setWasListening(listening)
    if (!listening && step === 'idle') {
      if (text.trim() !== '') setStep('review')
      else if (!speech.error) setNotHeard(true)
    }
  }

  // Opening the sheet listens right away when the browser already has the microphone permission; otherwise the person
  // gets a small button (and no error) to turn it on.
  const [checkingMic, setCheckingMic] = useState(
    () => step === 'idle' && typeof navigator !== 'undefined' && !!navigator.permissions?.query,
  )
  useEffect(() => {
    if (!checkingMic) return
    let cancelled = false
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === 'granted') speech.start()
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCheckingMic(false)
      })
    return () => {
      cancelled = true
    }
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startListening() {
    setParseError(null)
    setNotHeard(false)
    setText('')
    setStep('idle')
    speech.start()
  }

  function startEditing(from: 'idle' | 'review') {
    speech.stop()
    setEditFrom(from)
    setStep('editing')
  }

  function discard() {
    setText('')
    setParseError(null)
    setNotHeard(false)
    speech.stop()
    setStep('idle')
  }

  function cancelEditing() {
    setParseError(null)
    if (editFrom === 'review' && text.trim() !== '') setStep('review')
    else if (startWith === 'text' || !speech.supported) onClose()
    else setStep('idle')
  }

  function submitText() {
    const trimmed = text.trim()
    if (trimmed === '' || busy) return
    speech.stop()
    setParseError(null)
    parse.mutate(trimmed, {
      onSuccess: (response) => {
        const next = prepareDrafts(response, accounts, categories)
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

  if (plusRequired) return <PlusSheet reason="voice" onClose={onClose} />

  if (step === 'confirm') {
    return (
      <DraftConfirmation
        initialDrafts={drafts}
        notice={notice}
        // The lilac microphone: nothing is saved and Moni listens again.
        onRerecord={speech.supported ? startListening : undefined}
        onClose={onClose}
      />
    )
  }

  if (step === 'editing') {
    return (
      <VoiceFrame title="Carga por voz" onClose={onClose}>
        <VoiceLayout
          top={
            <>
              <Mascot />
              <div className="w-full rounded-[28px] bg-card px-4 py-3.5">
                <label>
                  <span className="text-[14px] font-semibold text-text-muted">
                    {speech.supported
                      ? 'Escribilo como te salga:'
                      : 'Escribime lo que gastaste o cobraste:'}
                  </span>
                  <textarea
                    value={text}
                    maxLength={500}
                    rows={3}
                    disabled={parse.isPending}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Gasté $8.000 en el súper"
                    aria-label="Lo que gastaste o cobraste"
                    className="mt-1 w-full resize-none bg-transparent text-[17px] leading-6 text-ink outline-none placeholder:text-text-muted"
                  />
                </label>
              </div>
              {parseError && (
                <p role="alert" className="text-center text-[15px] font-semibold text-expense">
                  {parseError}
                </p>
              )}
              <p aria-live="polite" className="min-h-5 text-center text-[15px] text-text-muted">
                {parse.isPending ? 'Entendiendo…' : online ? '' : OFFLINE_MESSAGE}
              </p>
            </>
          }
          bottom={
            <>
              <button
                type="button"
                className={mainButton}
                disabled={text.trim() === '' || busy || dataLoading || !online}
                onClick={submitText}
              >
                {parse.isPending ? 'Entendiendo…' : 'Listo'}
              </button>
              <button
                type="button"
                className={smallButton}
                disabled={parse.isPending}
                onClick={cancelEditing}
              >
                Cancelar
              </button>
            </>
          }
        />
      </VoiceFrame>
    )
  }

  if (step === 'review') {
    return (
      <VoiceFrame title="Carga por voz" onClose={onClose}>
        <VoiceLayout
          top={
            <>
              <Mascot />
              <p className={labelClass}>Te escuché decir:</p>
              <p aria-label="Lo que dijiste" className={transcriptClass}>
                “{text}”
              </p>
              {parseError && (
                <p role="alert" className="text-center text-[15px] font-semibold text-expense">
                  {parseError}
                </p>
              )}
              <p aria-live="polite" className="min-h-5 text-center text-[15px] text-text-muted">
                {parse.isPending ? 'Entendiendo…' : online ? '' : OFFLINE_MESSAGE}
              </p>
            </>
          }
          bottom={
            <>
              <button
                type="button"
                className={mainButton}
                disabled={busy || dataLoading}
                onClick={submitText}
              >
                {!parse.isPending && <Check aria-hidden="true" className="size-5" strokeWidth={2.6} />}
                {parse.isPending ? 'Entendiendo…' : 'Listo'}
              </button>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className={smallButton}
                  disabled={parse.isPending}
                  onClick={() => startEditing('review')}
                >
                  <Pencil aria-hidden="true" className="size-3.5" /> Editar
                </button>
                {speech.supported && (
                  <button
                    type="button"
                    className={smallButton}
                    disabled={parse.isPending}
                    onClick={startListening}
                  >
                    <RotateCcw aria-hidden="true" className="size-3.5" /> Volver a grabar
                  </button>
                )}
                <button
                  type="button"
                  className={smallButton}
                  disabled={parse.isPending}
                  onClick={discard}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" /> Eliminar
                </button>
              </div>
            </>
          }
        />
      </VoiceFrame>
    )
  }

  // idle: Moni greets, or listens while the microphone is on (screen 10).
  const failed = speech.error !== null
  return (
    <VoiceFrame title="Carga por voz" onClose={onClose}>
      <VoiceLayout
        top={
          <>
            <Mascot />
            {listening ? (
              <>
                <p aria-live="polite" className={labelClass}>
                  Te escucho…
                </p>
                {text !== '' && (
                  <p
                    aria-live="polite"
                    aria-label="Lo que se va entendiendo"
                    className={cn(transcriptClass, 'max-h-36 overflow-y-auto')}
                  >
                    “{text}”
                  </p>
                )}
                <AudioWave />
              </>
            ) : (
              <p
                role="status"
                aria-live="polite"
                className="max-w-[300px] text-center text-[20px] font-medium leading-[1.25] tracking-[-0.02em]"
              >
                {speech.error
                  ? SPEECH_MESSAGES[speech.error]
                  : notHeard
                    ? SPEECH_MESSAGES.no_speech
                    : '¡Hola! Contame qué gastaste o cobraste'}
              </p>
            )}
          </>
        }
        bottom={
          listening ? (
            <>
              {/* Ends the dictation now: no need to wait for the pause. What was heard shows up to review. */}
              <button
                type="button"
                className={mainButton}
                disabled={text.trim() === ''}
                onClick={speech.stop}
              >
                Listo
              </button>
              <button
                type="button"
                className={smallButton}
                aria-label="Cancelar escucha"
                onClick={discard}
              >
                Cancelar
              </button>
            </>
          ) : (
            !checkingMic &&
            (failed || notHeard ? (
              <>
                <button type="button" className={mainButton} onClick={() => startEditing('idle')}>
                  Escribir
                </button>
                {speech.supported && speech.error !== 'denied' && (
                  <button type="button" className={smallButton} onClick={startListening}>
                    <Mic aria-hidden="true" className="size-4" /> Probar de nuevo
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" className={mainButton} onClick={startListening}>
                  <Mic aria-hidden="true" className="size-5" /> Activar micrófono
                </button>
                <button type="button" className={smallButton} onClick={() => startEditing('idle')}>
                  <Pencil aria-hidden="true" className="size-3.5" /> Prefiero escribir
                </button>
              </>
            ))
          )
        }
      />
    </VoiceFrame>
  )
}
