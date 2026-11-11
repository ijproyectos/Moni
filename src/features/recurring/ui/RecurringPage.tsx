import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { NewFixedExpenseFlow } from '@/features/fixedExpenses/ui/NewFixedExpenseFlow'
import { FixedExpensesPanel } from '@/features/fixedExpenses/ui/FixedExpensesPanel'
import { NewSubscriptionFlow } from '@/features/subscriptions/ui/NewSubscriptionFlow'
import { SubscriptionsPanel } from '@/features/subscriptions/ui/SubscriptionsPanel'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MENTA_CIRCLE } from '@/shared/ui/mentaStyles'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'

type Tab = 'suscripciones' | 'gastos-fijos'

/**
 * Pagos recurrentes: Suscripciones (charged by Moni on their dates) and Gastos fijos (Moni reminds, the person
 * registers the real payment). Installments live in Medios de pago › Cuotas.
 */
export function RecurringPage() {
  const [params, setParams] = useSearchParams()
  const [sheet, setSheet] = useState<null | 'sub' | 'fixed'>(null)
  const [fixedSummary, setFixedSummary] = useState<string | null>(null)

  // Old links: ?tab=cuotas now lives under Medios de pago.
  if (params.get('tab') === 'cuotas') return <Navigate to="/cuentas?tab=cuotas" replace />
  const tab: Tab = params.get('tab') === 'gastos-fijos' ? 'gastos-fijos' : 'suscripciones'

  const addLabel = tab === 'suscripciones' ? 'Nueva suscripción' : 'Nuevo gasto fijo'

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader
        title={tab === 'suscripciones' ? 'Suscripciones' : 'Gastos fijos'}
        subtitle={tab === 'gastos-fijos' ? (fixedSummary ?? undefined) : undefined}
        backTo="/perfil"
        action={
          <button
            type="button"
            aria-label={addLabel}
            onClick={() => setSheet(tab === 'suscripciones' ? 'sub' : 'fixed')}
            className={MENTA_CIRCLE}
          >
            <Plus aria-hidden="true" className="size-5" strokeWidth={2} />
          </button>
        }
      />
      <SegmentedControl
        variant="menta"
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
        <FixedExpensesPanel onAdd={() => setSheet('fixed')} onCount={setFixedSummary} />
      )}

      {sheet === 'sub' && <NewSubscriptionFlow onClose={() => setSheet(null)} />}
      {sheet === 'fixed' && <NewFixedExpenseFlow onClose={() => setSheet(null)} />}
    </section>
  )
}
