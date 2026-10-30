import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { HeaderAddButton, Page } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useInstallmentViews } from '@/features/cards/api/useInstallmentViews'
import { InstallmentsPanel } from '@/features/cards/ui/InstallmentsPanel'
import { NewInstallmentSheet } from '@/features/cards/ui/NewInstallmentSheet'
import { NewSubscriptionFlow } from '@/features/subscriptions/ui/NewSubscriptionFlow'
import { SubscriptionsPanel } from '@/features/subscriptions/ui/SubscriptionsPanel'

// Screens 074 / 075 / 076 / 077 — Fijos y cuotas.
export function RecurringPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cuotas' ? 'cuotas' : 'subs'
  const [sheet, setSheet] = useState<null | { kind: 'sub' } | { kind: 'cuota' }>(null)

  const { monthlyCents: monthlyCuotas } = useInstallmentViews()

  return (
    <Page>
      <PageHeader
        title="Fijos y cuotas"
        backTo="/mas"
        action={
          <HeaderAddButton
            label={tab === 'subs' ? 'Nueva suscripción' : 'Nueva compra en cuotas'}
            onClick={() => setSheet(tab === 'subs' ? { kind: 'sub' } : { kind: 'cuota' })}
          />
        }
      />
      <SegmentedControl
        label="Tipo"
        value={tab}
        onChange={(t) => setParams(t === 'cuotas' ? { tab: 'cuotas' } : {}, { replace: true })}
        options={[
          { value: 'subs', label: 'Suscripciones' },
          { value: 'cuotas', label: 'Cuotas' },
        ]}
      />

      {tab === 'subs' ? (
        <SubscriptionsPanel onAdd={() => setSheet({ kind: 'sub' })} />
      ) : (
        <InstallmentsPanel />
      )}

      {sheet?.kind === 'sub' && <NewSubscriptionFlow onClose={() => setSheet(null)} />}
      {sheet?.kind === 'cuota' && (
        <NewInstallmentSheet monthlyNow={monthlyCuotas} onClose={() => setSheet(null)} />
      )}
    </Page>
  )
}
