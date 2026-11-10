import { Check, Mic } from 'lucide-react'
import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { validateDraft, type DraftMovement } from '@/features/ai/domain/draft'
import { useCategories } from '@/features/categories/api/useCategories'
import { useDailyAllowance } from '@/features/dashboard/api/useDailyAllowance'
import { todayAfterExpense } from '@/features/dashboard/domain/todayLeft'
import { toUserMessage } from '@/shared/lib/errors'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { todayIso } from '@/shared/lib/month'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { MINT_PILL } from '@/shared/ui/mentaStyles'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateTransactions } from '../api/useTransactions'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatArs } from '@/shared/lib/money'
import type { TransactionFormValues } from '../domain/transaction'
import { MovementConfirmCards } from './MovementConfirmCards'
import { VoiceFrame } from './VoiceFrame'

interface DraftConfirmationProps {
  /** Drafts produced by voice, text or a receipt photo. Editable here; nothing is saved until "Confirmar". */
  initialDrafts: DraftMovement[]
  /** Optional line about what was adjusted or dropped while parsing. */
  notice: string | null
  /** The lilac microphone: discard these drafts and speak again. Without it (receipt photos) the button is not shown. */
  onRerecord?: () => void
  onClose: () => void
}

/**
 * Shared confirmation list ("Revisá y guardá") for every AI-assisted entry: voice, text and receipt photos.
 * The person reviews compact cards (tap to fix the amount or the note, small dropdowns for the rest) and explicitly confirms; only then are transactions created.
 */
export function DraftConfirmation({
  initialDrafts,
  notice,
  onRerecord,
  onClose,
}: DraftConfirmationProps) {
  const toast = useToast()
  const online = useOnlineStatus()
  const [drafts, setDrafts] = useState<DraftMovement[]>(initialDrafts)
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({})
  const today = todayIso()

  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()
  const saveMany = useCreateTransactions()
  const allowance = useDailyAllowance()

  const accounts = accountsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const count = drafts.length

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

  let spentCents = 0
  let earnedCents = 0
  for (const d of drafts) {
    const cents = parseAmountInput(d.amount)
    if (cents === null || cents <= 0) continue
    if (d.kind === 'expense') spentCents += cents
    else earnedCents += cents
  }
  const confirmLabel = saveMany.isPending
    ? 'Guardando…'
    : count === 1
      ? drafts[0]?.kind === 'income'
        ? 'Guardar ingreso'
        : 'Guardar gasto'
      : 'Guardar movimientos'

  // "Con este gasto, hoy te quedan $X": only with data, and only for what is dated today.
  const todayExpenses = drafts.filter(
    (d) => d.kind === 'expense' && d.occurredOn === today && (parseAmountInput(d.amount) ?? 0) > 0,
  )
  const todayCents = todayExpenses.reduce((sum, d) => sum + (parseAmountInput(d.amount) ?? 0), 0)
  const leftLine =
    allowance.allowance.kind === 'ok' && todayExpenses.length > 0 ? (
      <span className="text-[12.5px] text-text-muted">
        {todayExpenses.length === 1 ? 'Con este gasto' : 'Con estos gastos'}, hoy te quedan{' '}
        <AmountDisplay
          cents={todayAfterExpense(allowance.allowance.dailyCents, todayCents).leftCents}
          className="font-semibold text-ok-ink"
        />{' '}
        para gastar.
      </span>
    ) : null

  return (
    <VoiceFrame title="Revisá y guardá" onClose={onClose}>
      {count > 1 && (
        <p className="text-center text-[15px] font-bold" aria-live="polite">
          {`${count} movimientos`}
          {spentCents > 0 && ` · Salen ${formatArs(spentCents)}`}
          {earnedCents > 0 && ` · Entran ${formatArs(earnedCents)}`}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-[12px] bg-gold/25 px-3 py-2 text-[14px] leading-5">
          {notice}
        </p>
      )}
      {accounts.length === 0 ? (
        <p role="alert" className="py-6 text-center text-text-muted">
          Necesitás al menos una cuenta para guardar movimientos.
        </p>
      ) : (
        <MovementConfirmCards
          drafts={drafts}
          categories={categories}
          accounts={accounts}
          today={today}
          errors={draftErrors}
          disabled={saveMany.isPending}
          onChange={patchDraft}
          onRemove={removeDraft}
          cardFooter={leftLine}
        />
      )}
      {count > 1 && leftLine && <p className="text-center">{leftLine}</p>}
      {!online && (
        <p role="status" className="text-center text-sm font-semibold text-text-muted">
          {OFFLINE_MESSAGE}
        </p>
      )}
      <div
        className={cn('mt-auto grid gap-2.5', onRerecord ? 'grid-cols-[64px_1fr]' : 'grid-cols-1')}
      >
        {onRerecord && (
          <button
            type="button"
            aria-label="Volver a grabar"
            disabled={saveMany.isPending}
            onClick={onRerecord}
            className={cn(
              'flex h-14 items-center justify-center rounded-full bg-lilac text-lilac-ink disabled:opacity-60',
              FOCUS_RING,
            )}
          >
            <Mic aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />
          </button>
        )}
        <button
          type="button"
          className={cn(MINT_PILL, 'h-[52px] text-[16px] font-semibold')}
          disabled={count === 0 || accounts.length === 0 || saveMany.isPending || !online}
          onClick={() => void saveAll()}
        >
          {!saveMany.isPending && <Check aria-hidden="true" className="size-5" strokeWidth={2.6} />}
          {confirmLabel}
        </button>
      </div>
    </VoiceFrame>
  )
}
