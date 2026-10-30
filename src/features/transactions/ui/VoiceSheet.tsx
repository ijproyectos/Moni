import { Mic, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { MoniFortuneCat } from '@/shared/ui/MoniFortuneCat'
import { SpeechBubble } from '@/shared/ui/SpeechBubble'
import { prepareDrafts } from '../domain/prepareDrafts'
import { DraftConfirmation } from './DraftConfirmation'

/** What the cat says when the microphone does not work: it stays in the conversation, and offers to type. */
const SPEECH_MESSAGES: Record<SpeechError, string> = {
  denied: 'No pude usar el micrófono. Podés escribirme lo que gastaste o cobraste.',
  no_speech: 'No te escuché. ¿Probamos de nuevo o me lo escribís?',
  unavailable: 'El dictado no está disponible ahora. Podés escribirme lo que gastaste o cobraste.',
}

/** Waits this long without new words before it stops by itself: room to think between expenses. */
const PAUSE_MS = 4500

const smallButton =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-sand px-2.5 font-display text-[14px] font-extrabold text-ink transition hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-60'

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
        // "Descartar": nothing is saved and the transcript stays to try again.
        onBack={() => setStep(text.trim() === '' ? 'idle' : 'review')}
        onClose={onClose}
      />
    )
  }

  if (step === 'editing') {
    return (
      <BottomSheet title="Carga por voz" onClose={onClose}>
        <MoniFortuneCat
          mode={parse.isPending ? 'thinking' : undefined}
          className="mx-auto w-[clamp(130px,40vw,170px)]"
        />
        <SpeechBubble tip="up" from="you" className="mt-3">
          <label>
            <span className="text-[14px] font-bold text-text-muted">
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
        </SpeechBubble>
        {parseError && (
          <p role="alert" className="mt-2 text-center text-[15px] font-semibold text-expense">
            {parseError}
          </p>
        )}
        <p aria-live="polite" className="mt-2 min-h-5 text-center text-[15px] text-text-muted">
          {parse.isPending ? 'Entendiendo…' : online ? '' : OFFLINE_MESSAGE}
        </p>
        <div className="mt-1 flex justify-center">
          <Button
            variant="dark"
            className="!h-12 !w-full max-w-[260px]"
            disabled={text.trim() === '' || busy || dataLoading || !online}
            onClick={submitText}
          >
            {parse.isPending ? 'Entendiendo…' : 'Listo'}
          </Button>
        </div>
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            className={smallButton}
            disabled={parse.isPending}
            onClick={cancelEditing}
          >
            Cancelar
          </button>
        </div>
      </BottomSheet>
    )
  }

  if (step === 'review') {
    return (
      <BottomSheet title="Carga por voz" onClose={onClose}>
        <MoniFortuneCat
          mode={parse.isPending ? 'thinking' : undefined}
          className="mx-auto w-[clamp(130px,40vw,170px)]"
        />
        <SpeechBubble tip="up" from="you" className="mt-3" aria-label="Lo que dijiste">
          <p className="text-[14px] font-bold text-text-muted">Te escuché decir:</p>
          <p className="mt-0.5 break-words">“{text}”</p>
        </SpeechBubble>
        {parseError && (
          <p role="alert" className="mt-2 text-center text-[15px] font-semibold text-expense">
            {parseError}
          </p>
        )}
        <p aria-live="polite" className="mt-2 min-h-5 text-center text-[15px] text-text-muted">
          {parse.isPending ? 'Entendiendo…' : online ? '' : OFFLINE_MESSAGE}
        </p>
        <div className="mt-1 flex justify-center">
          <Button
            variant="dark"
            className="!h-12 !w-full max-w-[260px]"
            disabled={busy || dataLoading}
            onClick={submitText}
          >
            {parse.isPending ? 'Entendiendo…' : 'Listo'}
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
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
      </BottomSheet>
    )
  }

  // idle: the cat greets, or listens while the microphone is on.
  const failed = speech.error !== null
  return (
    <BottomSheet title="Carga por voz" onClose={onClose}>
      <div className="flex flex-col items-center">
        {listening ? (
          <SpeechBubble
            tip="down"
            from="you"
            aria-live="polite"
            aria-label="Lo que se va entendiendo"
            className="max-h-36 [&>div]:max-h-36 [&>div]:overflow-y-auto"
          >
            <p className="break-words">
              {text !== '' ? text : <span className="text-text-muted">Te escucho…</span>}
            </p>
          </SpeechBubble>
        ) : (
          <SpeechBubble tip="down" role="status" aria-live="polite">
            {speech.error
              ? SPEECH_MESSAGES[speech.error]
              : notHeard
                ? SPEECH_MESSAGES.no_speech
                : '¡Hola! Contame qué gastaste o cobraste'}
          </SpeechBubble>
        )}
        <MoniFortuneCat
          mode={listening ? 'listening' : undefined}
          pulse={text.length}
          className="mt-3 w-[clamp(170px,56vw,230px)]"
        />
        {listening && (
          <p className="flex items-center gap-2 text-[15px] font-bold text-text-muted">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-expense motion-safe:animate-pulse"
            />
            Escuchando…
          </p>
        )}
      </div>

      {listening ? (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className={smallButton}
            aria-label="Cancelar escucha"
            onClick={discard}
          >
            Cancelar
          </button>
        </div>
      ) : (
        !checkingMic && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {failed || notHeard ? (
              <>
                <Button
                  variant="dark"
                  className="!h-11 !w-auto px-5 text-[16px]"
                  onClick={() => startEditing('idle')}
                >
                  Escribir
                </Button>
                {speech.supported && speech.error !== 'denied' && (
                  <button type="button" className={smallButton} onClick={startListening}>
                    <Mic aria-hidden="true" className="size-4" /> Probar de nuevo
                  </button>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="dark"
                  className="!h-11 !w-auto px-5 text-[16px]"
                  onClick={startListening}
                >
                  <Mic aria-hidden="true" className="mr-2 size-5" /> Activar micrófono
                </Button>
                <button type="button" className={smallButton} onClick={() => startEditing('idle')}>
                  <Pencil aria-hidden="true" className="size-3.5" /> Prefiero escribir
                </button>
              </>
            )}
          </div>
        )
      )}
    </BottomSheet>
  )
}
