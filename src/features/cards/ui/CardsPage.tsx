import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { availableCredit, cardDebtOf, isCreditCard } from '@/features/accounts/domain/account'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { formatArs } from '@/shared/lib/money'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { HeaderAddButton, Page, Panel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useInstallmentViews } from '../api/useInstallmentViews'
import { CardSummarySection } from './CardSummarySection'
import { InstallmentsPanel } from './InstallmentsPanel'
import { NewInstallmentSheet } from './NewInstallmentSheet'

/**
 * Tarjetas de crédito: each card with its limit, debt and statements (Mis tarjetas) and the purchases in cuotas
 * (Cuotas, the same panel and sheet that used to live in "Fijos y cuotas").
 */
export function CardsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cuotas' ? 'cuotas' : 'tarjetas'
  const accounts = useAccounts()
  const { openNew } = useMovementSheet()
  const { monthlyCents } = useInstallmentViews()
  const [newPurchase, setNewPurchase] = useState(false)
  const cards = (accounts.data ?? []).filter(isCreditCard)

  return (
    <Page>
      <PageHeader
        title="Tarjetas de crédito"
        backTo="/mas"
        action={
          tab === 'cuotas' ? (
            <HeaderAddButton label="Nueva compra en cuotas" onClick={() => setNewPurchase(true)} />
          ) : (
            <HeaderAddButton label="Agregar tarjeta" to="/cuentas" />
          )
        }
      />
      <SegmentedControl
        label="Tarjetas o cuotas"
        value={tab}
        onChange={(t) => setParams(t === 'cuotas' ? { tab: 'cuotas' } : {}, { replace: true })}
        options={[
          { value: 'tarjetas', label: 'Mis tarjetas' },
          { value: 'cuotas', label: 'Cuotas' },
        ]}
      />

      {tab === 'cuotas' ? (
        <InstallmentsPanel />
      ) : accounts.isLoading ? (
        <div role="status" aria-label="Cargando tarjetas" className="flex flex-col gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : cards.length === 0 ? (
        <Panel>
          <EmptyState
            mascotUrl={mascotAssistant}
            title="Todavía no tenés tarjetas"
            description="Agregá tu tarjeta de crédito en Medios de pago con su límite y sus días de cierre y vencimiento."
            action={
              <Link to="/cuentas">
                <Button>Agregar una tarjeta</Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        cards.map((card) => {
          const credit = availableCredit(card)
          return (
            <Panel key={card.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-display text-[22px] font-extrabold leading-7">
                    {card.name}
                  </span>
                  <span className="block text-[14px] leading-5 text-text-muted">
                    {card.closingDay !== null && card.dueDay !== null
                      ? `Cierra el ${card.closingDay} · vence el ${card.dueDay}`
                      : 'Sin día de cierre y vencimiento'}
                    {card.creditLimitCents !== null &&
                      ` · límite ${formatArs(card.creditLimitCents)}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
                    {credit !== null ? 'Disponible' : 'Deuda'}
                  </span>
                  <span className="block text-[18px] font-extrabold">
                    {formatArs(credit !== null ? credit : cardDebtOf(card))}
                  </span>
                </span>
              </div>
              <CardSummarySection
                accountId={card.id}
                onPay={(amountCents) => openNew('transfer', { toAccountId: card.id, amountCents })}
              />
              <Link
                to="/cuentas"
                className="self-start text-[14px] font-extrabold text-forest underline"
              >
                Editar la tarjeta en Medios de pago
              </Link>
            </Panel>
          )
        })
      )}

      {newPurchase && (
        <NewInstallmentSheet monthlyNow={monthlyCents} onClose={() => setNewPurchase(false)} />
      )}
    </Page>
  )
}
