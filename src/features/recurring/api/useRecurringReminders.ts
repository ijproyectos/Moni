import { useFixedExpenseReminders } from '@/features/fixedExpenses/api/useFixedExpenses'
import { useSubscriptionReminders } from '@/features/subscriptions/api/useSubscriptions'

export const RECURRING_PATH = '/recurrentes'
export const FIXED_TAB_PATH = '/recurrentes?tab=gastos-fijos'

export interface RecurringReminder {
  key: string
  text: string
  /** Where the reminder leads. */
  to: string
}

/**
 * Everything Moni reminds about recurring payments, in the app only (no push): tomorrow's subscription charges, and
 * fixed expenses that fall due today or tomorrow.
 */
export function useRecurringReminders(): RecurringReminder[] {
  const subscriptions = useSubscriptionReminders()
  const fixed = useFixedExpenseReminders()
  return [
    ...fixed.map((r) => ({ key: `fixed-${r.key}`, text: r.text, to: FIXED_TAB_PATH })),
    ...subscriptions.map((r) => ({
      key: `sub-${r.subscriptionId}`,
      text: r.text,
      to: RECURRING_PATH,
    })),
  ]
}
