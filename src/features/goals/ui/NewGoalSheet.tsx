import { usePlanAccess } from '@/features/plus/api/usePlanAccess'
import { PlusPromoDialog } from '@/features/plus/ui/PlusPromoDialog'
import { useSavings } from '../api/useSavings'
import { SavingsGoalFormSheet } from './SavingsGoalFormSheet'

/**
 * What the "¿Conviene en cuotas?" calculator hands over to start a goal: the name, the amount and the months it
 * has to be saved in. Kept as is so that screen needs no change.
 */
export interface NewGoalPrefill {
  name: string
  amountCents: number
  months: number
  /** Extra installments cost avoided, shown when the plan comes from "¿Conviene en cuotas?". */
  comparedSavingCents?: number
  comparedCount?: number
}

/**
 * Nueva meta: a real savings goal (money reserved in one of the person's accounts). The shared goals, which are
 * still simulated, are created from their own button ("Compartidas") in Metas.
 */
export function NewGoalSheet({
  onClose,
  prefill,
}: {
  onClose: () => void
  prefill?: NewGoalPrefill
}) {
  // Free plan: ONE goal in total, whatever its type, currency or state (paused, completed and archived ones count); the server
  // enforces the same. Every way of starting a goal (Metas, cuotas) passes through here.
  const access = usePlanAccess()
  const savings = useSavings()
  const created = (savings.data?.goals ?? []).length
  if (!access.canCreate('goals', created)) return <PlusPromoDialog feature="goals" onClose={onClose} />
  return (
    <SavingsGoalFormSheet
      prefill={
        prefill
          ? { name: prefill.name, amountCents: prefill.amountCents, months: prefill.months }
          : undefined
      }
      onClose={onClose}
    />
  )
}
