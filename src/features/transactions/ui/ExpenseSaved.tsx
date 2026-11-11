import { Check, Plus, Undo2 } from 'lucide-react'
import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useVoidInstallmentPlan } from '@/features/cards/api/useCards'
import { DAY_STATUS_LABELS, type DayStatus } from '@/features/dashboard/domain/monthPace'
import { todayAfterExpense } from '@/features/dashboard/domain/todayLeft'
import { formatRelativeDay } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import type { Cents } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { useOnlineStatus } from '@/shared/lib/useOnlineStatus'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { MINT_PILL, WHITE_PILL } from '@/shared/ui/mentaStyles'
import { cn } from '@/shared/ui/cn'
import { StatusChip, type StatusChipTone } from '@/shared/ui/StatusChip'
import { useToast } from '@/shared/ui/toastContext'
import { useVoidTransaction } from '../api/useTransactions'

/** What the confirmation needs to know about the expense that was just saved. */
export interface SavedExpense {
  /** Id of the new row (null when the database did not return it: "Deshacer" is then not offered). */
  transactionId: string | null
  installmentPlanId: string | null
  amountCents: Cents
  categoryName: string | null
  accountName: string | null
  occurredOn: string
  /** Today's allowance before this expense; null without data ("sin-datos"): the allowance card is omitted. */
  dailyBeforeCents: Cents | null
}

const TONE: Record<DayStatus, StatusChipTone> = {
  'vas-bien': 'ok',
  ajustado: 'warn',
  'te-pasaste': 'bad',
}

interface ExpenseSavedProps {
  saved: SavedExpense
  /** "Cargar otro": back to an empty form. */
  onAnother: () => void
  /** "Volver a Hoy". */
  onHome: () => void
  /** The expense was voided: close everything. */
  onUndone: () => void
}

/** Screen 20: the expense is saved. Shows what is left for today and offers to undo it or to load another one. */
export function ExpenseSaved({ saved, onAnother, onHome, onUndone }: ExpenseSavedProps) {
  const toast = useToast()
  const online = useOnlineStatus()
  const voidTransaction = useVoidTransaction()
  const voidPlan = useVoidInstallmentPlan()
  const [error, setError] = useState<string | null>(null)
  const undoing = voidTransaction.isPending || voidPlan.isPending
  const canUndo = saved.transactionId !== null

  const today = todayIso()
  // "Lo de hoy" only makes sense for an expense of today.
  const after =
    saved.dailyBeforeCents !== null && saved.occurredOn === today
      ? todayAfterExpense(saved.dailyBeforeCents, saved.amountCents)
      : null
  const detail = [saved.categoryName, saved.accountName, formatRelativeDay(saved.occurredOn, today).toLowerCase()]
    .filter(Boolean)
    .join(' · ')

  async function undo() {
    if (!saved.transactionId || undoing) return
    setError(null)
    try {
      // A purchase in installments is undone as a whole plan, like everywhere else.
      if (saved.installmentPlanId) await voidPlan.mutateAsync(saved.installmentPlanId)
      else await voidTransaction.mutateAsync(saved.transactionId)
      toast.show(saved.installmentPlanId ? 'Compra en cuotas anulada' : 'Gasto deshecho')
      onUndone()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3 pb-1 pt-1" data-testid="expense-saved">
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 text-center">
        <div className="relative size-[132px]">
          <span className="absolute inset-0 rounded-full bg-ok-bg" />
          <span className="absolute inset-[18px] flex items-center justify-center rounded-full bg-mint">
            <Check aria-hidden="true" className="size-[46px] text-white" strokeWidth={3} />
          </span>
          <img
            src={mascotHappy}
            alt=""
            className="absolute -bottom-1 -right-2 size-[52px] rounded-full border-[3px] border-canvas bg-lilac"
          />
        </div>
        <p role="status" className="font-display text-[30px] font-bold tracking-[-0.03em]">
          Listo, guardado
        </p>
        <div className="flex flex-col gap-0.5">
          <span className="text-[22px] font-bold">
            −<AmountDisplay cents={saved.amountCents} />
          </span>
          {detail && <span className="text-[14px] text-text-muted">{detail}</span>}
        </div>
      </div>

      {after && (
        <div className="flex flex-col gap-2.5 rounded-[26px] bg-card px-[18px] py-4">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Hoy te quedan
            </span>
            <StatusChip tone={TONE[after.status]} className="px-2.5 py-[3px] text-[12px]">
              {DAY_STATUS_LABELS[after.status]}
            </StatusChip>
          </div>
          <AmountDisplay
            cents={after.leftCents}
            className="font-display text-[38px] font-bold leading-none tracking-[-0.04em]"
          />
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-mint"
              style={{ width: `${after.usedPercent}%` }}
            />
          </div>
          <span className="text-[12.5px] text-text-muted">
            Usaste el {after.usedPercent}% de lo de hoy
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-expense">
          {error}
        </p>
      )}

      <div className={cn('grid gap-2.5', canUndo ? 'grid-cols-2' : 'grid-cols-1')}>
        {canUndo && (
          <button
            type="button"
            disabled={undoing || !online}
            onClick={() => void undo()}
            className={cn(WHITE_PILL, 'h-12 text-[15px] font-semibold')}
          >
            <Undo2 aria-hidden="true" className="size-[18px]" strokeWidth={2} />
            {undoing ? 'Deshaciendo…' : 'Deshacer'}
          </button>
        )}
        <button
          type="button"
          disabled={undoing}
          onClick={onAnother}
          className={cn(WHITE_PILL, 'h-12 text-[15px] font-semibold')}
        >
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2} />
          Cargar otro
        </button>
      </div>
      <button type="button" onClick={onHome} className={cn(MINT_PILL, 'h-[54px] text-[16px] font-bold')}>
        Volver a Hoy
      </button>
    </div>
  )
}
