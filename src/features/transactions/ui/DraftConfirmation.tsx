import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { validateDraft, type DraftMovement } from '@/features/ai/domain/draft'
import { MovementDraftList } from '@/features/ai/ui/MovementDraftList'
import { useCategories } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { OFFLINE_MESSAGE } from '@/shared/lib/offline'
import { todayIso } from '@/shared/lib/month'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateTransactions } from '../api/useTransactions'
import type { TransactionFormValues } from '../domain/transaction'

interface DraftConfirmationProps {
  /** Drafts produced by voice, text or a receipt photo. Editable here; nothing is saved until "Guardar". */
  initialDrafts: DraftMovement[]
  /** Optional line about what was adjusted or dropped while parsing. */
  notice: string | null
  /** Lead text under the title (what the drafts come from). */
  intro: string
  /** When given, shows a "Volver" button (e.g. back to the transcript). */
  onBack?: () => void
  onClose: () => void
}

/**
 * Shared confirmation list ("Revisá y guardá") for every AI-assisted entry: voice, text and receipt photos.
 * The person edits each draft and explicitly taps "Guardar"; only then are transactions created.
 */
export function DraftConfirmation({
  initialDrafts,
  notice,
  intro,
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

  return (
    <BottomSheet title="Revisá y guardá" onClose={onClose}>
      <p className="text-[16px] leading-6 text-text-muted">{intro}</p>
      {notice && (
        <p role="status" className="mt-2 rounded-[12px] bg-gold/25 px-3 py-2 text-[14px] leading-5">
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
      {!online && (
        <p role="status" className="mt-3 text-center text-sm font-semibold text-text-muted">
          {OFFLINE_MESSAGE}
        </p>
      )}
      <Button
        variant="dark"
        className="mt-4"
        disabled={count === 0 || accounts.length === 0 || saveMany.isPending || !online}
        onClick={() => void saveAll()}
      >
        {saveMany.isPending
          ? 'Guardando…'
          : `Guardar ${count} ${count === 1 ? 'movimiento' : 'movimientos'}`}
      </Button>
      <div className="mt-1 flex justify-center gap-2">
        {onBack && (
          <Button variant="ghost" disabled={saveMany.isPending} onClick={onBack}>
            Volver
          </Button>
        )}
        <Button variant="ghost" disabled={saveMany.isPending} onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </BottomSheet>
  )
}
