import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { formatCompactDate, formatDayMonth, formatRelativeDay } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { cn } from '@/shared/ui/cn'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useCardOverview, useStatementItems } from '../api/useCards'
import type { CardOverview, Statement, StatementStatus } from '../domain/overview'

const STATUS_LABELS: Record<StatementStatus, string> = {
  paid: 'Pagado',
  billed: 'Facturado',
  open: 'En curso',
  future: 'Cuotas futuras',
}

/**
 * Debt of a card told apart: what is already billed, what is still to be billed, the installments to
 * come, the total owed and what is left of the limit; plus the monthly statements with partial payments.
 */
export function CardSummarySection({
  accountId,
  onPay,
}: {
  accountId: string
  /** Opens a transfer to this card; the amount is prefilled when given. */
  onPay: (amountCents?: number) => void
}) {
  const overview = useCardOverview(accountId)
  if (overview.isLoading) return <Skeleton className="h-40" />
  if (overview.isError || !overview.data) {
    return (
      <p role="alert" className="text-[14px] leading-5 text-text-muted">
        No pudimos cargar el resumen de la tarjeta.
      </p>
    )
  }
  const data = overview.data
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Resumen de la tarjeta</SectionLabel>
      <Figures data={data} />
      {data.billedCents > 0 && (
        <Button variant="dark" onClick={() => onPay(data.billedCents)}>
          Pagar lo facturado · {formatArs(data.billedCents)}
        </Button>
      )}
      {!data.configured && (
        <p className="text-[14px] leading-5 text-text-muted">
          Cargá el día de cierre y de vencimiento para ver los resúmenes y usar cuotas.
        </p>
      )}
      {data.statements.length > 0 && (
        <ul
          aria-label="Resúmenes"
          className="divide-y divide-sand rounded-[20px] border border-sand bg-white"
        >
          {data.statements.map((statement) => (
            <StatementRow
              key={statement.closingOn ?? 'previous'}
              accountId={accountId}
              statement={statement}
            />
          ))}
        </ul>
      )}
      <p className="text-[13px] leading-5 text-text-muted">
        Cada pago cubre primero el resumen más antiguo. Un pago parcial baja la deuda y no cuenta
        como gasto.
      </p>
    </div>
  )
}

function Figures({ data }: { data: CardOverview }) {
  const rows: { label: string; hint?: string; cents: number; strong?: boolean; tone?: 'danger' }[] =
    [
      {
        label: 'Deuda facturada',
        hint: 'Resúmenes ya cerrados sin pagar',
        cents: data.billedCents,
      },
      {
        label: 'Por facturar',
        hint: data.nextClosingOn ? `Cierra el ${formatDayMonth(data.nextClosingOn)}` : undefined,
        cents: data.openCents,
      },
      {
        label: 'Cuotas futuras',
        hint: 'Resúmenes que todavía no llegaron',
        cents: data.futureCents,
      },
      { label: 'Deuda total', cents: data.debtTotalCents, strong: true },
    ]
  return (
    <dl className="divide-y divide-sand rounded-[20px] border border-sand bg-white px-4 text-[16px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-3">
          <dt className={cn(row.strong ? 'font-extrabold' : 'text-text-muted')}>
            {row.label}
            {row.hint && (
              <span className="block text-[13px] font-normal text-text-muted">{row.hint}</span>
            )}
          </dt>
          <dd className="font-extrabold">{formatArs(row.cents)}</dd>
        </div>
      ))}
      {data.inFavorCents > 0 && (
        <div className="flex items-center justify-between gap-3 py-3">
          <dt className="text-text-muted">Saldo a favor</dt>
          <dd className="font-extrabold">{formatArs(data.inFavorCents)}</dd>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 py-3">
        <dt className="font-extrabold">
          Disponible
          <span className="block text-[13px] font-normal text-text-muted">
            {data.creditLimitCents === null
              ? 'Cargá un límite para verlo'
              : `Límite ${formatArs(data.creditLimitCents)} menos toda la deuda`}
          </span>
        </dt>
        <dd
          className={cn(
            'font-extrabold',
            data.availableCents !== null && data.availableCents < 0 && 'text-expense',
          )}
        >
          {data.availableCents === null ? '—' : formatArs(data.availableCents)}
        </dd>
      </div>
    </dl>
  )
}

function StatementRow({ accountId, statement }: { accountId: string; statement: Statement }) {
  const [open, setOpen] = useState(false)
  const title = statement.closingOn
    ? `Resumen del ${formatCompactDate(statement.closingOn)}`
    : 'Deuda anterior'
  const items = useStatementItems(accountId, open ? statement.closingOn : null)
  const today = todayIso()
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        disabled={!statement.closingOn}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:cursor-default"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold">{title}</span>
          <span className="block text-[13px] text-text-muted">
            {STATUS_LABELS[statement.status]}
            {statement.dueOn ? ` · vence el ${formatDayMonth(statement.dueOn)}` : ''}
          </span>
        </span>
        <span className="text-right">
          <span className="block text-[16px] font-extrabold">
            {formatArs(statement.chargedCents)}
          </span>
          {statement.paidCents > 0 && (
            <span className="block text-[13px] text-text-muted">
              {statement.remainingCents === 0
                ? 'Pagado'
                : `Pagaste ${formatArs(statement.paidCents)} · falta ${formatArs(statement.remainingCents)}`}
            </span>
          )}
        </span>
        {statement.closingOn && (
          <ChevronDown
            aria-hidden="true"
            className={cn('size-5 shrink-0 transition-transform', open && 'rotate-180')}
          />
        )}
      </button>
      {open && (
        <ul className="border-t border-sand bg-canvas px-4 py-2 text-[15px]">
          {items.isLoading && <li className="py-2 text-text-muted">Cargando…</li>}
          {items.isError && <li className="py-2 text-text-muted">No pudimos cargar el detalle.</li>}
          {items.data?.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">
                {t.note?.trim() || 'Compra'}
                {t.installmentNumber !== null && t.installmentsTotal !== null
                  ? ` · cuota ${t.installmentNumber}/${t.installmentsTotal}`
                  : ` · ${formatRelativeDay(t.occurredOn, today)}`}
              </span>
              <span className="font-extrabold">{formatArs(t.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
