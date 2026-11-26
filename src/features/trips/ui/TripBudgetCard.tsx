import { moneyIn } from '../domain/money'
import type { TripFinance } from '../domain/tripFinance'

function Row({ label, value, tone }: { label: string; value: string; tone?: 'muted' | 'bad' }) {
  return (
    <div className="flex justify-between gap-3 text-[15px]">
      <dt className="text-text-muted-on-dark">{label}</dt>
      <dd className={`font-extrabold ${tone === 'bad' ? 'text-expense-on-dark' : ''}`}>{value}</dd>
    </div>
  )
}

/**
 * The trip's numbers: budget (when there is one), what was spent and paid, what is still pending in the bookings, and what is left. A
 * booking and its payments are never added twice. Without a budget only what is registered and committed shows: no «available» and no
 * percentages that would mean nothing.
 */
export function TripBudgetCard({ finance, onSetBudget }: { finance: TripFinance; onSetBudget?: () => void }) {
  const cur = finance.currency
  const spentPct = Math.min(100, Math.round((finance.spentShare ?? 0) * 100))
  const committedPct = Math.min(100, Math.round((finance.committedShare ?? 0) * 100))
  return (
    <section aria-label="Presupuesto del viaje" className="rounded-[28px] bg-forest p-5 text-cream">
      {finance.hasBudget ? (
        <>
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">Presupuesto total</p>
          <p className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight">{moneyIn(finance.budgetCents, cur)}</p>
          <div
            role="progressbar"
            aria-label="Uso del presupuesto"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={committedPct}
            className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface"
          >
            <div className="h-full bg-lime" style={{ width: `${spentPct}%` }} />
            <div className="h-full bg-lime/45" style={{ width: `${Math.max(0, committedPct - spentPct)}%` }} />
          </div>
          <p className="mt-1 text-[13px] text-text-muted-on-dark">{committedPct}% entre gastado y comprometido</p>
        </>
      ) : (
        <>
          <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">Gastado y comprometido</p>
          <p className="font-display text-[clamp(30px,9vw,38px)] font-extrabold leading-tight">{moneyIn(finance.committedCents, cur)}</p>
        </>
      )}
      <dl className="mt-3 flex flex-col gap-1">
        <Row label="Gastos registrados (pagado)" value={moneyIn(finance.spentCents, cur)} />
        {finance.pendingCents > 0 && <Row label="Reservas pendientes de pago" value={moneyIn(finance.pendingCents, cur)} />}
        {finance.availableCents !== null && (
          <Row
            label={finance.availableCents >= 0 ? 'Disponible del presupuesto' : 'Te pasaste del presupuesto'}
            value={moneyIn(Math.abs(finance.availableCents), cur)}
            tone={finance.availableCents < 0 ? 'bad' : undefined}
          />
        )}
      </dl>
      {!finance.hasBudget && onSetBudget && (
        <button type="button" onClick={onSetBudget} className="mt-3 min-h-11 rounded-full bg-surface px-4 text-[14px] font-extrabold">
          Agregar un presupuesto
        </button>
      )}
      {finance.unconvertedCount > 0 && (
        <p className="mt-2 text-[12.5px] text-text-muted-on-dark">
          {finance.unconvertedCount} {finance.unconvertedCount === 1 ? 'importe' : 'importes'} en otra moneda no se pudo convertir y no está sumado.
        </p>
      )}
    </section>
  )
}
