import { CreditCard, ShoppingBag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { formatMonthShortYear, monthNameOf } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { IconTile, MoniGlyph, OptionRow, Panel, ProgressBar } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useVoidInstallmentPlan } from '../api/useCards'
import { useInstallmentViews } from '../api/useInstallmentViews'
import type { InstallmentPlanView } from '../domain/plans'

/** Screen 076 — installment purchases of the person's credit cards, from the database. */
export function InstallmentsPanel() {
  const accounts = useAccounts()
  const voidPlan = useVoidInstallmentPlan()
  const toast = useToast()
  const [voiding, setVoiding] = useState<InstallmentPlanView | null>(null)
  const [voidError, setVoidError] = useState<string | null>(null)

  const { views, monthlyCents: monthly, isLoading, isError } = useInstallmentViews()
  const cardNames = new Map((accounts.data ?? []).map((a) => [a.id, a.name]))

  const left = views.reduce((sum, v) => sum + v.remainingCents, 0)
  const [first, second] = views

  if (isLoading) return <Skeleton className="h-48" />
  if (isError) {
    return (
      <p role="alert" className="py-6 text-center text-text-muted">
        No pudimos cargar tus compras en cuotas.
      </p>
    )
  }

  async function confirmVoid() {
    if (!voiding) return
    try {
      await voidPlan.mutateAsync(voiding.id)
      toast.show('Compra en cuotas anulada')
      setVoiding(null)
      setVoidError(null)
    } catch (e) {
      setVoidError(toUserMessage(e))
    }
  }

  return (
    <>
      <section className="rounded-[28px] bg-forest p-5 text-cream">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          Pagás en cuotas
        </p>
        <p className="flex items-baseline gap-2">
          <span className="font-display text-[44px] font-extrabold leading-[52px]">
            {formatArs(monthly)}
          </span>
          <span className="text-[17px] text-text-muted-on-dark">por mes</span>
        </p>
        <p className="text-[16px] text-text-muted-on-dark">
          En total te quedan {formatArs(left)} por pagar
        </p>
      </section>

      {views.length === 0 && (
        <p className="py-4 text-center text-[16px] text-text-muted">
          Todavía no cargaste compras en cuotas. Tocá + para sumar la primera.
        </p>
      )}

      {views.map((c) => (
        <Panel key={c.id}>
          <div className="flex items-center gap-3">
            <IconTile icon={ShoppingBag} bg="#e3f2cf" color="#2f7d1f" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[19px] font-extrabold">{c.description}</span>
              <span className="block text-[15px] text-text-muted">
                {cardNames.get(c.accountId) ?? 'Tarjeta'} · termina en{' '}
                {formatMonthShortYear(c.endsOn).replace(' de ', ' ')}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[19px] font-extrabold">
                {formatArs(c.installmentCents)}
              </span>
              <span className="block text-[14px] text-text-muted">por mes</span>
            </span>
          </div>
          <ProgressBar value={c.paid / c.count} className="mt-3" />
          <div className="mt-2 flex items-center justify-between gap-2 text-[15px] font-extrabold">
            <span>
              Cuota {c.paid} de {c.count}
            </span>
            <span>Faltan {formatArs(c.remainingCents)}</span>
            <button
              type="button"
              aria-label={`Anular ${c.description}`}
              onClick={() => {
                setVoidError(null)
                setVoiding(c)
              }}
              className="flex size-11 items-center justify-center rounded-full text-expense"
            >
              <Trash2 aria-hidden="true" className="size-5" />
            </button>
          </div>
        </Panel>
      ))}

      {first && second && (
        <Panel className="flex items-start gap-4">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-[16px] bg-gold/40">
            <MoniGlyph className="size-9" />
          </span>
          <p className="text-[16px] leading-6">
            <strong className="font-extrabold">Sugerido:</strong> en {monthNameOf(first.endsOn)}{' '}
            dejás de pagar {first.description.toLowerCase()} y liberás{' '}
            {formatArs(first.installmentCents)} por mes. En {monthNameOf(second.endsOn)},{' '}
            {formatArs(second.installmentCents)} más.
          </p>
        </Panel>
      )}
      <OptionRow
        to="/metas/cuotas"
        icon={<IconTile icon={CreditCard} bg="#fdeab8" />}
        title="¿Vas a comprar algo en cuotas?"
        subtitle="Compará si te conviene"
      />

      {voiding && (
        <ConfirmDialog
          title="¿Anular la compra en cuotas?"
          message={
            voidError ??
            `Se anulan todas las cuotas de "${voiding.description}", también las que todavía no llegaron, y baja tu deuda. Esta acción no se puede deshacer.`
          }
          confirmLabel="Anular compra"
          isBusy={voidPlan.isPending}
          onConfirm={() => void confirmVoid()}
          onCancel={() => {
            setVoiding(null)
            setVoidError(null)
          }}
        />
      )}
    </>
  )
}
