import { ArrowRight, Check, Clock, X, type LucideIcon } from 'lucide-react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { isCreditCard } from '@/features/accounts/domain/account'
import { useCardOverview } from '@/features/cards/api/useCards'
import { useStatementBars } from '@/features/cards/api/useStatementBars'
import { cardCeilingCents, purchaseTip } from '@/features/cards/domain/statementChart'
import { useDailyAllowance } from '@/features/dashboard/api/useDailyAllowance'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { formatMonthName } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import {
  evaluatePurchase,
  overCeiling,
  projectStatements,
  VERDICT_LABELS,
  type PurchaseRequest,
  type Verdict,
} from '../domain/purchaseVerdict'

const CHIP: Record<Verdict, { icon: LucideIcon; tone: string; ink: string }> = {
  conviene: { icon: Check, tone: 'bg-ok-bg text-ok-ink', ink: 'text-ok-ink' },
  espera: { icon: Clock, tone: 'bg-warn-bg text-warn-ink', ink: 'text-warn-ink' },
  'no-conviene': { icon: X, tone: 'bg-bad-bg text-bad-ink', ink: 'text-bad-ink' },
}

const BAR_AREA_PX = 80
const BARS_SHOWN = 3

/**
 * Verdict of a purchase mentioned in the chat, from real data only: the daily allowance (before / after the first
 * payment) and, when the person has a configured card, the projected statements against the 20% ceiling. Missing data
 * simply leaves its part out; without a daily allowance there is no card at all.
 */
export function PurchaseVerdictCard({
  request,
  message,
}: {
  request: PurchaseRequest
  /** The user's text: it can name one of their cards. */
  message: string
}) {
  const { allowance, isLoading } = useDailyAllowance()
  const accounts = useAccounts()
  const cards = (accounts.data ?? []).filter((a) => isCreditCard(a) && a.archivedAt === null)
  const lower = message.toLowerCase()
  const card = cards.find((c) => lower.includes(c.name.toLowerCase())) ?? cards[0]
  const overview = useCardOverview(card?.id ?? '', Boolean(card))
  const statements = overview.data?.statements ?? []
  const { bars } = useStatementBars(card?.id ?? '', statements)
  const { openNew } = useMovementSheet()

  if (isLoading || allowance.kind !== 'ok') return null

  const projected = projectStatements(bars, request).slice(0, BARS_SHOWN)
  const ceiling = cardCeilingCents(allowance.expectedIncomeCents)
  const result = evaluatePurchase({
    request,
    allowance: {
      dailyCents: allowance.dailyCents,
      remainingCents: allowance.remainingCents,
      daysLeft: allowance.daysLeft,
    },
    statementOverCeiling: overCeiling(projected, ceiling),
  })
  if (!result) return null

  const { icon: Icon, tone, ink } = CHIP[result.verdict]
  const tip = overview.data ? purchaseTip(overview.data.closingDay, overview.data.dueDay, todayIso()) : null
  const firstOver = projected.find((b) => ceiling !== null && b.currentCents + b.addedCents > ceiling)
  const scale = Math.max(ceiling ?? 0, ...projected.map((b) => b.currentCents + b.addedCents), 1) * 1.1

  return (
    <>
    <p className="max-w-[86%] self-start rounded-[26px_20px_20px_6px] bg-card px-3.5 py-[9px] text-[14.5px] leading-[1.35]">
      <span className="sr-only">Moni: </span>
      {request.installments > 1 && (
        <>
          Cada cuota es de <AmountDisplay cents={result.perInstallmentCents} />.{' '}
        </>
      )}
      Mirá cómo queda:
    </p>
    <section
      aria-label="Veredicto"
      className="flex flex-col gap-2 rounded-[28px] bg-card px-3.5 py-3"
    >
      <div className="flex items-center justify-between">
        <Kicker as="span" className="font-medium">
          Veredicto
        </Kicker>
        <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-[5px] text-[15px] font-bold', tone)}>
          <Icon aria-hidden="true" className="size-[15px]" strokeWidth={2.4} />
          {VERDICT_LABELS[result.verdict]}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_24px_1fr] items-center gap-1.5 rounded-2xl bg-canvas px-3 py-2">
        <div>
          <p className="text-[12px] text-text-muted">Disponible hoy · antes</p>
          <AmountDisplay cents={result.beforeDailyCents} className="block text-[20px] font-semibold tracking-[-0.02em]" />
        </div>
        <ArrowRight aria-hidden="true" className="size-5 text-text-muted" />
        <div>
          <p className="text-[12px] text-text-muted">Después</p>
          <AmountDisplay
            cents={result.afterDailyCents}
            className={cn('block text-[20px] font-semibold tracking-[-0.02em]', result.verdict !== 'conviene' && ink)}
          />
        </div>
      </div>

      {projected.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="flex justify-between text-[13px] font-medium">
            Cómo queda tu resumen {card?.name}
            <span className="flex items-center gap-[5px] text-[11.5px] font-normal text-[#4F6157] dark:text-text-muted">
              <span aria-hidden="true" className="size-[9px] rounded-[3px] bg-[#E8B931]" />
              Cuota nueva
            </span>
          </p>
          <div
            role="img"
            aria-label={`Resúmenes proyectados: ${projected
              .map((b) => `${formatMonthName(b.closingOn)} ${Math.round((b.currentCents + b.addedCents) / 100)} pesos`)
              .join(', ')}`}
            className="relative grid grid-cols-3 items-end gap-[18px] px-[18px]"
            style={{ height: BAR_AREA_PX }}
          >
            {ceiling !== null && (
              <>
                <div
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t-[1.5px] border-dashed border-expense"
                  style={{ bottom: Math.round((ceiling / scale) * BAR_AREA_PX) }}
                />
                <span
                  aria-hidden="true"
                  className="absolute right-0 text-[10.5px] font-semibold text-expense"
                  style={{ bottom: Math.round((ceiling / scale) * BAR_AREA_PX) + 3 }}
                >
                  Techo
                </span>
              </>
            )}
            {projected.map((b) => (
              <div
                key={b.closingOn}
                aria-hidden="true"
                className="flex flex-col justify-end overflow-hidden rounded-xl"
                style={{ height: Math.max(4, Math.round(((b.currentCents + b.addedCents) / scale) * BAR_AREA_PX)) }}
              >
                <span
                  className="bg-[#E8B931]"
                  style={{ height: Math.round((b.addedCents / (b.currentCents + b.addedCents || 1)) * 100) + '%' }}
                />
                <span className="flex-1 bg-mint" />
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="grid grid-cols-3 gap-[18px] px-[18px] text-center text-[11.5px] text-text-muted">
            {projected.map((b) => (
              <span key={b.closingOn}>{formatMonthName(b.closingOn).slice(0, 3)}</span>
            ))}
          </div>
        </div>
      )}

      <p className="text-pretty text-[14px] leading-[1.4]">
        {result.verdict === 'no-conviene'
          ? `Con lo que te queda del mes no alcanza para ${request.installments > 1 ? 'la primera cuota' : 'este gasto'}.`
          : result.verdict === 'espera'
            ? firstOver
              ? `Así tu resumen de ${formatMonthName(firstOver.closingOn).toLowerCase()} pasa el techo del 20% de tus ingresos.${tip ? ` Si la comprás después del ${tip.day}, la primera cuota entra en el resumen siguiente.` : ''}`
              : 'Tu disponible por día baja bastante: si podés, esperá.'
            : 'Entra en tu presupuesto del mes y tu día queda cómodo.'}
      </p>

      <button
        type="button"
        onClick={() => openNew('expense', { amountCents: request.amountCents })}
        className={cn(
          'h-10 rounded-full bg-sand text-[14px] font-medium',
          FOCUS_RING,
        )}
      >
        La compro igual
      </button>
    </section>
    </>
  )
}
