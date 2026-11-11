import { Check, Share2, UsersRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Cents } from '@/shared/lib/money'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { BigFigure } from '@/shared/ui/BigFigure'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { useMyInitial } from '@/shared/ui/myInitialContext'
import type { BalanceHeadline } from '../domain/groupsOverview'
import { initialsOf } from '../domain/groupsOverview'

/** Green hero of the group detail: who owes whom, the amount, and the two actions. */
export function GroupBalanceHero({
  headline,
  myNetCents,
  onSettle,
  onRemind,
}: {
  headline: BalanceHeadline
  myNetCents: Cents
  onSettle: () => void
  /** Only given when there is a real way to send a reminder (share or copy). */
  onRemind?: () => void
}) {
  const white = `flex h-[42px] items-center justify-center gap-1.5 rounded-full text-[14.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`
  return (
    <section aria-label="Saldo del grupo" className="flex flex-col gap-2.5 rounded-[30px] bg-mint px-[18px] py-4 text-white">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-lilac-soft text-[13px] font-bold text-[#4A3F96]"
        >
          {headline.otherName ? initialsOf(headline.otherName) : <UsersRound className="size-[18px]" />}
        </span>
        <p className="text-[15px] text-[#DDF3E6]">{headline.label}</p>
      </div>
      <BigFigure cents={Math.abs(myNetCents)} />
      <div className={cn('grid gap-2', onRemind ? 'grid-cols-2' : 'grid-cols-1')}>
        <button
          type="button"
          onClick={onSettle}
          disabled={myNetCents === 0}
          className={cn(white, 'bg-white font-bold text-mint-ink disabled:opacity-60')}
        >
          <Check aria-hidden="true" className="size-4" strokeWidth={2.4} />
          Registrar pago
        </button>
        {onRemind && (
          <button type="button" onClick={onRemind} className={cn(white, 'bg-white/[.16] font-semibold')}>
            <Share2 aria-hidden="true" className="size-4" />
            Recordarle
          </button>
        )}
      </div>
    </section>
  )
}

function PaidCard({ label, cents, tone, initials, icon: Icon }: { label: string; cents: Cents; tone: 'me' | 'other'; initials: string; icon?: LucideIcon }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-[22px] bg-card p-3">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
          tone === 'me' ? 'bg-mint-soft text-mint-ink' : 'bg-lilac-soft text-[#4A3F96]',
        )}
      >
        {Icon ? <Icon className="size-[18px]" /> : initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[12.5px] text-text-muted">{label}</p>
        <AmountDisplay cents={cents} className="block truncate text-[15.5px] font-bold" />
      </div>
    </div>
  )
}

/** "Vos pagaste $X" / "<Persona> pagó $Y", straight from the ledger. */
export function GroupPaidCards({
  myPaidCents,
  otherPaidCents,
  otherName,
}: {
  myPaidCents: Cents
  otherPaidCents: Cents
  /** Name of the other person, or null for "the rest of the group". */
  otherName: string | null
}) {
  const myInitial = useMyInitial()
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <PaidCard label="Vos pagaste" cents={myPaidCents} tone="me" initials={myInitial} />
      <PaidCard
        label={otherName ? `${otherName} pagó` : 'Los demás pagaron'}
        cents={otherPaidCents}
        tone="other"
        initials={otherName ? initialsOf(otherName) : ''}
        icon={otherName ? undefined : UsersRound}
      />
    </div>
  )
}

export interface GroupExpenseRowData {
  id: string
  title: string
  meta: string
  amountCents: Cents
  /** What it does to my balance: "Mel te debe" / "Le debés" followed by the amount; null when it does not move it. */
  balanceLabel: string | null
  balanceCents: Cents
  balanceTone: 'owed' | 'owes' | null
  icon: LucideIcon
}

/** The "Gastos del grupo" card: one row per expense, each one opens its detail. */
export function GroupExpenseRows({
  rows,
  onOpen,
  empty,
}: {
  rows: readonly GroupExpenseRowData[]
  onOpen: (id: string) => void
  empty: ReactNode
}) {
  if (rows.length === 0) return <p className="rounded-[26px] bg-card p-5 text-center text-[15px] text-text-muted">{empty}</p>
  return (
    <ul className="divide-y divide-line rounded-[26px] bg-card px-4 py-0.5">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            onClick={() => onOpen(r.id)}
            className={cn('grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 py-[9px] text-left', FOCUS_RING)}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                r.balanceTone === 'owes' ? 'bg-bad-bg text-bad-ink' : 'bg-ok-bg text-ok-ink',
              )}
            >
              <r.icon className="size-[18px]" strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span className="line-clamp-2 block text-[15px] font-semibold">{r.title}</span>
              <span className="block text-[12px] text-text-muted">{r.meta}</span>
            </span>
            <span className="text-right">
              <AmountDisplay cents={r.amountCents} className="block whitespace-nowrap text-[15px] font-semibold" />
              {r.balanceLabel && (
                <span
                  className={cn(
                    'block text-[12px] font-semibold',
                    r.balanceTone === 'owes' ? 'text-expense' : 'text-income',
                  )}
                >
                  {r.balanceLabel} <AmountDisplay cents={r.balanceCents} />
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
