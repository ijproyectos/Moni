import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { NewFixedExpenseFlow } from '@/features/fixedExpenses/ui/NewFixedExpenseFlow'
import { FixedExpensesPanel } from '@/features/fixedExpenses/ui/FixedExpensesPanel'
import { NewSubscriptionFlow } from '@/features/subscriptions/ui/NewSubscriptionFlow'
import { SubscriptionsPanel } from '@/features/subscriptions/ui/SubscriptionsPanel'
import { HeaderAddButton, Page } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'

type Tab = 'suscripciones' | 'gastos-fijos'

/**
 * Pagos recurrentes: Suscripciones (charged by Moni on their dates) and Gastos fijos (Moni reminds, the person
 * registers the real payment). Installments live in Medios de pago › Cuotas.
 */
export function RecurringPage() {
  const [params, setParams] = useSearchParams()
  const [sheet, setSheet] = useState<null | 'sub' | 'fixed'>(null)

  // Old links: ?tab=cuotas now lives under Medios de pago.
  if (params.get('tab') === 'cuotas') return <Navigate to="/cuentas?tab=cuotas" replace />
  const tab: Tab = params.get('tab') === 'gastos-fijos' ? 'gastos-fijos' : 'suscripciones'

  return (
    <Page>
      <PageHeader
        title="Pagos recurrentes"
        backTo="/mas"
        action={
          <HeaderAddButton
            label={tab === 'suscripciones' ? 'Nueva suscripción' : 'Nuevo gasto fijo'}
            onClick={() => setSheet(tab === 'suscripciones' ? 'sub' : 'fixed')}
          />
        }
      />
      <SegmentedControl
        label="Tipo de pago recurrente"
        value={tab}
        onChange={(t) =>
          setParams(t === 'gastos-fijos' ? { tab: 'gastos-fijos' } : {}, { replace: true })
        }
        options={[
          { value: 'suscripciones', label: 'Suscripciones' },
          { value: 'gastos-fijos', label: 'Gastos fijos' },
        ]}
      />

      {tab === 'suscripciones' ? (
        <SubscriptionsPanel onAdd={() => setSheet('sub')} />
      ) : (
        <FixedExpensesPanel onAdd={() => setSheet('fixed')} />
      )}

      {sheet === 'sub' && <NewSubscriptionFlow onClose={() => setSheet(null)} />}
      {sheet === 'fixed' && <NewFixedExpenseFlow onClose={() => setSheet(null)} />}
    </Page>
  )
}
