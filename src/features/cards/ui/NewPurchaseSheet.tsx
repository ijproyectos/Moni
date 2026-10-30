import { useInstallmentViews } from '../api/useInstallmentViews'
import { NewInstallmentSheet } from './NewInstallmentSheet'

/** "Nueva compra en cuotas" with the current monthly installments total, for hosts that only own the open state. */
export function NewPurchaseSheet({ onClose }: { onClose: () => void }) {
  const { monthlyCents } = useInstallmentViews()
  return <NewInstallmentSheet monthlyNow={monthlyCents} onClose={onClose} />
}
