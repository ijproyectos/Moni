import { ArrowRight } from 'lucide-react'
import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Card } from '@/shared/ui/Card'
import { cn } from '@/shared/ui/cn'
import { type GroupMember, type MemberBalance, type Settlement } from '../domain/group'
import { canRecordReceipt, canVoidSettlement, nameById } from '../domain/groupView'
import type { Transfer } from '../domain/split'

interface BalancesPanelProps {
  balances: readonly MemberBalance[]
  members: readonly GroupMember[]
  transfers: readonly Transfer[]
  settlements: readonly Settlement[]
  meId: string
  onSettle: (transfer: Transfer) => void
  onVoidSettlement: (settlement: Settlement) => void
  onRecordReceipt: (settlement: Settlement) => void
}

const sectionTitle = 'mb-2 px-1 font-display text-xl font-semibold'
const smallButton =
  'flex min-h-11 items-center rounded-full border border-cream bg-canvas px-4 font-display text-sm font-semibold text-forest'

/** "Saldos" tab: per-member net, how to settle up and the settlements history. */
export function BalancesPanel({
  balances,
  members,
  transfers,
  settlements,
  meId,
  onSettle,
  onVoidSettlement,
  onRecordReceipt,
}: BalancesPanelProps) {
  const today = todayIso()
  const visibleBalances = balances.filter(
    (b) => b.netCents !== 0 || members.some((m) => m.userId === b.userId && m.leftAt === null),
  )

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="balances-title">
        <h2 id="balances-title" className={sectionTitle}>
          Saldos
        </h2>
        <Card className="py-1">
          <ul className="divide-y divide-cream">
            {visibleBalances.map((b) => (
              <li key={b.userId} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">
                  {nameById(balances, b.userId, meId)}
                </span>
                <span
                  className={cn(
                    'text-right text-[15px]',
                    b.netCents > 0 && 'text-income',
                    b.netCents < 0 && 'text-expense',
                    b.netCents === 0 && 'text-text-muted',
                  )}
                >
                  {b.netCents === 0 ? (
                    'Al día'
                  ) : (
                    <>
                      {b.netCents > 0 ? 'Le deben ' : 'Debe '}
                      <AmountDisplay
                        cents={Math.abs(b.netCents)}
                        className="font-display font-semibold"
                      />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-labelledby="settle-title">
        <h2 id="settle-title" className={sectionTitle}>
          Cómo saldar
        </h2>
        {transfers.length === 0 ? (
          <Card>
            <p className="text-center text-[16px] text-text-muted">No hay nada para saldar.</p>
          </Card>
        ) : (
          <Card className="py-1">
            <ul className="divide-y divide-cream">
              {transfers.map((t) => (
                <li
                  key={`${t.fromUserId}-${t.toUserId}`}
                  className="flex min-h-14 items-center gap-3 py-2"
                >
                  <span className="min-w-0 flex-1 text-[16px] leading-6">
                    <span className="font-semibold">{nameById(balances, t.fromUserId, meId)}</span>
                    <ArrowRight aria-label="le paga a" className="mx-1 inline size-4" />
                    <span className="font-semibold">{nameById(balances, t.toUserId, meId)}</span>
                    <AmountDisplay
                      cents={t.amountCents}
                      className="block font-display font-semibold"
                    />
                  </span>
                  {t.fromUserId === meId && (
                    <button type="button" className={smallButton} onClick={() => onSettle(t)}>
                      Saldar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {settlements.length > 0 && (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className={sectionTitle}>
            Pagos registrados
          </h2>
          <Card className="py-1">
            <ul className="divide-y divide-cream">
              {settlements.map((s) => {
                const voided = s.status === 'voided'
                return (
                  <li key={s.id} className="flex flex-col gap-1 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'min-w-0 flex-1 text-[16px] leading-6',
                          voided && 'line-through opacity-60',
                        )}
                      >
                        <span className="font-semibold">{nameById(members, s.fromUser, meId)}</span>
                        {' le pagó a '}
                        <span className="font-semibold">{nameById(members, s.toUser, meId)}</span>
                        <span className="block text-sm text-text-muted">
                          {voided ? 'Anulado · ' : ''}
                          {formatRelativeDay(s.occurredOn, today)}
                          {s.note ? ` · ${s.note}` : ''}
                        </span>
                      </span>
                      <AmountDisplay
                        cents={s.amountCents}
                        className={cn(
                          'font-display font-semibold',
                          voided && 'line-through opacity-60',
                        )}
                      />
                    </div>
                    {(canRecordReceipt(s, meId) || canVoidSettlement(s, meId)) && (
                      <div className="flex flex-wrap gap-2">
                        {canRecordReceipt(s, meId) && (
                          <button
                            type="button"
                            className={smallButton}
                            onClick={() => onRecordReceipt(s)}
                          >
                            Registrar en una cuenta
                          </button>
                        )}
                        {canVoidSettlement(s, meId) && (
                          <button
                            type="button"
                            className={smallButton}
                            onClick={() => onVoidSettlement(s)}
                            aria-label={`Anular pago de ${nameById(members, s.fromUser, meId)} a ${nameById(members, s.toUser, meId)}`}
                          >
                            Anular
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      )}
    </div>
  )
}
