import { BusFront, Mic, RefreshCw, Utensils, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import mascotUrl from '@/assets/mascot/personaje_carga-por-voz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useParseMovements } from '@/features/ai/api/useParseMovements'
import { toDrafts, validateDraft, type DraftMovement } from '@/features/ai/domain/draft'
import { MovementDraftList } from '@/features/ai/ui/MovementDraftList'
import { useSpeechRecognition, type SpeechError } from '@/features/ai/ui/useSpeechRecognition'
import { useCategories } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { IconTile, SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateTransactions } from '../api/useTransactions'
import type { TransactionFormValues } from '../domain/transaction'

const EXAMPLE: {
  title: string
  category: string
  cents: number
  icon: LucideIcon
  bg: string
  color: string
}[] = [
  {
    title: 'Colectivo',
    category: 'Transporte',
    cents: 5_000_00,
    icon: BusFront,
    bg: '#d9ebe4',
    color: '#2f7d6f',
  },
  {
    title: 'Almuerzo',
    category: 'Comida',
    cents: 18_000_00,
    icon: Utensils,
    bg: '#fbdcd7',
    color: '#b8321f',
  },
  {
    title: 'Netflix',
    category: 'Suscripciones',
    cents: 8_000_00,
    icon: RefreshCw,
    bg: '#fdeab8',
    color: '#8a5a00',
  },
]

const SPEECH_MESSAGES: Record<SpeechError, string> = {
  denied: 'No pudimos usar el micrófono. Podés escribirlo acá abajo.',
  no_speech: 'No te escuché. Tocá el micrófono para probar de nuevo o escribilo acá abajo.',
  unavailable: 'El dictado no está disponible ahora. Escribilo acá abajo.',
}

type Step = 'promo' | 'input' | 'confirm'

interface VoiceSheetProps {
  onClose: () => void
  /** `text` skips the promo and opens the text box directly ("Escribilo como te salga"). */
  startWith?: 'promo' | 'text'
}

// Screen 016 — Carga por voz. Voice or text -> AI draft -> editable confirmation -> save. Nothing is saved
// without the explicit "Guardar" tap, and only the transcript text (never audio) is sent to the function.
export function VoiceSheet({ onClose, startWith = 'promo' }: VoiceSheetProps) {
  const toast = useToast()
  const [step, setStep] = useState<Step>(startWith === 'text' ? 'input' : 'promo')
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<DraftMovement[]>([])
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const today = todayIso()

  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()
  const parse = useParseMovements()
  const saveMany = useCreateTransactions()
  const speech = useSpeechRecognition({ onTranscript: setText })

  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const dataLoading = accountsQuery.isLoading || categoriesQuery.isLoading
  const busy = parse.isPending || saveMany.isPending

  function startListening() {
    setParseError(null)
    setStep('input')
    if (speech.supported) speech.start()
  }

  function submitText() {
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
        const codes = new Set(response.warnings.map((w) => w.code))
        const notes: string[] = []
        if (codes.has('items_truncated')) notes.push('Tomamos solo los primeros 10 movimientos.')
        if (codes.has('date_adjusted')) notes.push('Ajustamos alguna fecha: revisala.')
        if (codes.has('item_dropped')) notes.push('Dejamos afuera algo que no se entendió.')
        setNotice(notes.length > 0 ? notes.join(' ') : null)
        setDrafts(next)
        setDraftErrors({})
        setStep('confirm')
      },
      onError: (error) => setParseError(toUserMessage(error)),
    })
  }

  function cancelInput() {
    speech.stop()
    setText('')
    setParseError(null)
    if (startWith === 'text') onClose()
    else setStep('promo')
  }

  function patchDraft(key: string, patch: Partial<DraftMovement>) {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)))
    setDraftErrors((current) => {
      if (!(key in current)) return current
      const { [key]: _removed, ...rest } = current
      void _removed
      return rest
    })
  }

  function removeDraft(key: string) {
    setDrafts((current) => current.filter((d) => d.key !== key))
  }

  async function saveAll() {
    const items: { key: string; values: TransactionFormValues }[] = []
    const errors: Record<string, string> = {}
    for (const draft of drafts) {
      const result = validateDraft(draft)
      if (result.ok) items.push({ key: draft.key, values: result.values })
      else errors[draft.key] = result.message
    }
    setDraftErrors(errors)
    if (Object.keys(errors).length > 0 || items.length === 0) return

    const results = await saveMany.mutateAsync(items)
    const failed = results.filter((r) => !r.ok)
    if (failed.length === 0) {
      toast.show(
        items.length === 1 ? 'Guardé 1 movimiento' : `Guardé ${items.length} movimientos`,
        { mascotUrl: mascotHappy },
      )
      onClose()
      return
    }
    const failedErrors: Record<string, string> = {}
    for (const r of failed) if (!r.ok) failedErrors[r.key] = toUserMessage(r.error)
    const failedKeys = new Set(failed.map((r) => r.key))
    setDrafts((current) => current.filter((d) => failedKeys.has(d.key)))
    setDraftErrors(failedErrors)
    toast.show(`Guardé ${results.length - failed.length} de ${results.length}. Revisá el resto.`, {
      tone: 'error',
    })
  }

  if (step === 'confirm') {
    const count = drafts.length
    return (
      <BottomSheet title="Revisá y guardá" onClose={onClose}>
        <p className="text-[16px] leading-6 text-text-muted">
          Esto es lo que entendí. Corregí lo que haga falta: no se guarda nada hasta que lo
          confirmes.
        </p>
        {notice && (
          <p
            role="status"
            className="mt-2 rounded-[12px] bg-gold/25 px-3 py-2 text-[14px] leading-5"
          >
            {notice}
          </p>
        )}
        {accounts.length === 0 ? (
          <p role="alert" className="py-6 text-center text-text-muted">
            Necesitás al menos una cuenta para guardar movimientos.
          </p>
        ) : (
          <div className="mt-3">
            <MovementDraftList
              drafts={drafts}
              categories={categories}
              accounts={accounts}
              today={today}
              errors={draftErrors}
              disabled={saveMany.isPending}
              onChange={patchDraft}
              onRemove={removeDraft}
            />
          </div>
        )}
        <Button
          variant="dark"
          className="mt-4"
          disabled={count === 0 || accounts.length === 0 || saveMany.isPending}
          onClick={() => void saveAll()}
        >
          {saveMany.isPending
            ? 'Guardando…'
            : `Guardar ${count} ${count === 1 ? 'movimiento' : 'movimientos'}`}
        </Button>
        <div className="mt-1 flex justify-center gap-2">
          <Button variant="ghost" disabled={saveMany.isPending} onClick={() => setStep('input')}>
            Volver
          </Button>
          <Button variant="ghost" disabled={saveMany.isPending} onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </BottomSheet>
    )
  }

  if (step === 'input') {
    const voiceMode = speech.supported
    const status = parse.isPending
      ? 'Entendiendo lo que dijiste…'
      : speech.listening
        ? 'Escuchando… hablá tranqui.'
        : voiceMode
          ? 'Tocá el micrófono para hablar.'
          : ''
    return (
      <BottomSheet
        title={voiceMode ? 'Carga por voz' : 'Escribilo como te salga'}
        onClose={onClose}
      >
        <div className="flex flex-col items-center gap-3">
          {voiceMode && (
            <button
              type="button"
              aria-pressed={speech.listening}
              aria-label={speech.listening ? 'Dejar de escuchar' : 'Hablar'}
              disabled={busy}
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              className="relative flex size-24 items-center justify-center rounded-full bg-lime text-forest disabled:opacity-60"
            >
              {speech.listening && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-lime/60 motion-safe:animate-ping"
                />
              )}
              <Mic
                aria-hidden="true"
                className={cn('relative size-10', speech.listening && 'text-expense')}
              />
            </button>
          )}
          <p aria-live="polite" className="min-h-6 text-center text-[16px] text-text-muted">
            {status}
          </p>
          {speech.error && (
            <p role="alert" className="text-center text-[15px] text-expense">
              {SPEECH_MESSAGES[speech.error]}
            </p>
          )}
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            {voiceMode ? 'Lo que dijiste' : 'Escribilo como te salga'}
          </span>
          <textarea
            value={text}
            maxLength={500}
            rows={4}
            disabled={parse.isPending}
            onChange={(e) => setText(e.target.value)}
            placeholder="Gasté 5 lucas en el bondi, 18 en el almuerzo y cobré el sueldo"
            className="w-full resize-none rounded-[18px] border border-sand bg-white p-4 text-[17px] leading-6 text-forest placeholder:text-text-muted"
          />
        </label>
        {parseError && (
          <p role="alert" className="mt-2 text-[15px] font-semibold text-expense">
            {parseError}
          </p>
        )}
        <Button
          variant="dark"
          className="mt-4"
          disabled={text.trim() === '' || busy || dataLoading}
          onClick={submitText}
        >
          {parse.isPending ? 'Entendiendo…' : 'Listo'}
        </Button>
        <div className="mt-1 flex justify-center">
          <Button variant="ghost" disabled={parse.isPending} onClick={cancelInput}>
            Cancelar
          </Button>
        </div>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet title="Carga por voz" onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <img src={mascotUrl} alt="" className="size-32" />
        <h3 className="mt-2 font-display text-[28px] font-extrabold leading-8">
          Cargá varios gastos de una, hablando
        </h3>
        <p className="mt-2 text-[16px] leading-6 text-text-muted">
          Decí todo junto, como te salga. Moni separa cada gasto y lo pone en su categoría.
        </p>
      </div>
      <div className="mt-4 rounded-[24px] border border-sand bg-white p-4">
        <SectionLabel>Ejemplo</SectionLabel>
        <div className="mt-2 flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime">
            <Mic aria-hidden="true" className="size-5" />
          </span>
          <p className="rounded-[18px] bg-gold/25 px-4 py-3 text-left text-[16px] leading-6">
            “Gasté 5 lucas en el bondi, 18 en el almuerzo y pagué 8 de Netflix”
          </p>
        </div>
        <ul className="mt-2 divide-y divide-sand">
          {EXAMPLE.map((e) => (
            <li key={e.title} className="flex items-center gap-3 py-2.5">
              <IconTile icon={e.icon} bg={e.bg} color={e.color} />
              <span className="flex-1 text-left">
                <span className="block text-[18px] font-extrabold">{e.title}</span>
                <span className="block text-[15px] text-text-muted">{e.category}</span>
              </span>
              <span className="rounded-full bg-blush/50 px-3 py-1 text-[16px] font-extrabold text-expense">
                {formatArs(-e.cents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button variant="dark" className="mt-4" onClick={startListening}>
        Probar ahora
      </Button>
      <div className="mt-1 flex justify-center">
        <Button variant="ghost" onClick={() => setStep('input')}>
          Prefiero escribir
        </Button>
      </div>
      <p className="mt-2 text-center text-[14px] leading-5 text-text-muted">
        Podés sumar la fecha si querés: “ayer”, “el lunes”. Antes de guardar, revisás todo.
      </p>
    </BottomSheet>
  )
}
