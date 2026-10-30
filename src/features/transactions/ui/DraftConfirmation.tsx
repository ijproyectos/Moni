import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { validateDraft, type DraftMovement } from '@/features/ai/domain/draft'
import { useCategories } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { todayIso } from '@/shared/lib/month'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { MoniFortuneCat } from '@/shared/ui/MoniFortuneCat'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateTransactions } from '../api/useTransactions'
import { parseAmountInput } from '@/shared/lib/amountInput'
import { formatArs } from '@/shared/lib/money'
import type { TransactionFormValues } from '../domain/transaction'
import { MovementConfirmCards } from './MovementConfirmCards'

interface DraftConfirmationProps {
  /** Drafts produced by voice, text or a receipt photo. Editable here; nothing is saved until "Confirmar". */
  initialDrafts: DraftMovement[]
  /** Optional line about what was adjusted or dropped while parsing. */
  notice: string | null
  /** "Descartar" goes here when given (e.g. back to the transcript); otherwise it just closes. */
  onBack?: () => void
  onClose: () => void
}

/**
 * Shared confirmation list ("Revisá y guardá") for every AI-assisted entry: voice, text and receipt photos.
 * The person reviews compact cards (tap to fix the amount or the note, small dropdowns for the rest) and explicitly confirms; only then are transactions created.
 */
export function DraftConfirmation({
  initialDrafts,
  notice,
  onBack,
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
        ? 'Confirmar ingreso'
        : 'Confirmar gasto'
      : 'Confirmar movimientos'

  return (
    <BottomSheet title="Revisá y guardá" onClose={onClose}>
      <div className="mb-3 flex items-center justify-center gap-3">
        <MoniFortuneCat className="w-[64px] shrink-0" />
        {count > 1 && (
          <p className="text-[15px] font-bold" aria-live="polite">
            {`${count} movimientos`}
            {spentCents > 0 && ` · Salen ${formatArs(spentCents)}`}
            {earnedCents > 0 && ` · Entran ${formatArs(earnedCents)}`}
          </p>
        )}
      </div>
      {notice && (
        <p role="status" className="mb-2 rounded-[12px] bg-gold/25 px-3 py-2 text-[14px] leading-5">
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
        />
      )}
      {!online && (
        <p role="status" className="mt-3 text-center text-sm font-semibold text-text-muted">
          {OFFLINE_MESSAGE}
        </p>
      )}
      <div className="mt-3 flex justify-center">
        <Button
          variant="dark"
          className="!h-12 !w-full max-w-[300px]"
          disabled={count === 0 || accounts.length === 0 || saveMany.isPending || !online}
          onClick={() => void saveAll()}
        >
          {confirmLabel}
        </Button>
      </div>
      <div className="mt-1 flex justify-center">
        <button
          type="button"
          disabled={saveMany.isPending}
          onClick={onBack ?? onClose}
          className="min-h-10 px-4 text-[15px] font-bold text-text-muted hover:underline disabled:opacity-60"
        >
          Descartar
        </button>
      </div>
    </BottomSheet>
  )
}
