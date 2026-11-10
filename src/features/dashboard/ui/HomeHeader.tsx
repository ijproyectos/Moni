import { Bell, Eye, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useNotifications } from '@/features/notifications/mock/notificationsStore'
import { FEATURES } from '@/shared/config/features'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { pairAmountSize } from '@/shared/lib/amountSize'
import { formatArs, type Cents } from '@/shared/lib/money'

interface HomeHeaderProps {
  initial: string
  /** Money on hand right now: cash, banks and wallets (no cards, archived accounts or savings goals). */
  availableCents: Cents
  incomeCents: Cents
  expenseCents: Cents
  /** Reminders (e.g. tomorrow's charges) that add to the bell's count. */
  reminderCount?: number
  /** Unread notices of groups (reminders and payments to confirm): they show the bell even while the old Avisos screen is off. */
  noticeCount?: number
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Moni Plus is running right now (real subscription status): the avatar wears the PLUS badge. */
  isPlus?: boolean
  /** First name for the greeting; without it the title is just "Hola". */
  name?: string | null
  /** Evolution of the available money (the sparkline), shown between the balance and the month's totals. */
  chart?: ReactNode
}

/** Size of the big balance: it shrinks with the number of digits so a long amount never leaves the screen. */
function balanceSize(digits: number): string {
  if (digits <= 7) return 'text-[42px]'
  if (digits <= 9) return 'text-[36px]'
  if (digits <= 11) return 'text-[30px]'
  return 'text-[26px]'
}

export function HomeHeader({
  initial,
  availableCents,
  incomeCents,
  expenseCents,
  reminderCount = 0,
  noticeCount = 0,
  photoUrl = null,
  isPlus = false,
  name = null,
  chart,
}: HomeHeaderProps) {
  const { hidden, toggle } = useHiddenAmounts()
  const { unread: unreadNotices } = useNotifications()
  const unread = FEATURES.notifications ? unreadNotices + reminderCount + noticeCount : noticeCount
  const showBell = FEATURES.notifications || noticeCount > 0
  // Hidden amounts must not give away that the balance is in the red.
  const negative = availableCents < 0 && !hidden
  const bigSize = balanceSize(hidden ? 4 : formatArs(Math.abs(availableCents)).length - 1)
  const chipText = pairAmountSize(
    hidden
      ? 0
      : Math.max(formatArs(-expenseCents).length, formatArs(incomeCents, { signed: true }).length),
    'home',
  )
  return (
    <header className="mx-3 mt-3 overflow-hidden rounded-[28px] bg-gradient-to-br from-forest to-surface px-5 pb-3 pt-6 text-ink [--color-expense:var(--color-expense-on-dark)] [--color-income:var(--color-income-on-dark)] [--color-ink:var(--color-cream)] [--color-line:color-mix(in_srgb,var(--color-lime)_40%,transparent)] [--color-sand:var(--color-surface)] [--color-text-muted:var(--color-text-muted-on-dark)] dark:from-card dark:to-sand dark:ring-1 dark:ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] font-extrabold leading-tight">
            {name ? `Hola, ${name}` : 'Hola'}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          {showBell && (
            <Link
              to={FEATURES.notifications ? '/avisos' : '/grupos/avisos'}
              aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
              className="relative flex size-11 items-center justify-center rounded-full bg-sand text-ink"
            >
              <Bell aria-hidden="true" className="size-5" strokeWidth={2} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-expense text-[12px] font-extrabold text-white">
                  {unread}
                </span>
              )}
            </Link>
          )}
          <Link
            to="/perfil"
            aria-label={isPlus ? 'Perfil, Moni Plus activo' : 'Perfil'}
            className="relative flex size-11 items-center justify-center rounded-full"
          >
            {isPlus && (
              <span
                data-plus-badge
                aria-hidden="true"
                className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-1.5 indent-[0.08em] text-[10px] font-extrabold leading-4 tracking-[0.08em] text-on-bright shadow-sm ring-2 ring-forest"
              >
                ✦ PLUS
              </span>
            )}
            <PhotoOrInitial
              url={photoUrl}
              initial={initial}
              alt="Tu foto de perfil"
              className="size-11"
              fallbackClassName="bg-lime font-display text-lg font-extrabold text-on-bright"
            />
          </Link>
        </div>
      </div>

      <div className="mt-3 flex items-start justify-between gap-3">
        <Link
          to="/cuentas"
          aria-label="Ver tus medios de pago"
          className="min-w-0 flex-1 rounded-[20px] outline-offset-4"
        >
          <p className="text-[15px] font-bold text-text-muted">Dinero disponible</p>
          <p
            className={cn(
              'flex items-baseline gap-0.5 font-display font-extrabold',
              negative && 'text-expense',
            )}
          >
            {/* `bare` drops the sign: money owed (accounts in the red) must not read as money on hand. */}
            {negative && <span className={cn(bigSize, 'leading-none')}>-</span>}
            <span
              className={cn(
                'self-start pt-1 text-[22px]',
                negative ? 'text-expense' : 'text-income',
              )}
            >
              $
            </span>
            <AmountDisplay
              cents={availableCents}
              bare
              className={cn(
                'min-w-0 leading-none tracking-tight',
                bigSize,
                negative ? 'text-expense' : 'text-ink',
              )}
            />
          </p>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted"
        >
          {hidden ? (
            <EyeOff aria-hidden="true" className="size-5" strokeWidth={2} />
          ) : (
            <Eye aria-hidden="true" className="size-5" strokeWidth={2} />
          )}
        </button>
      </div>

      {chart && <div className="-mx-5">{chart}</div>}

      <section aria-label="Gastos e ingresos del mes" className="mt-1">
        <div className="flex" role="group" aria-label="Gastos e ingresos del mes">
          <Link
            to="/este-mes"
            aria-label="Gastos del mes, ver el informe"
            className="flex min-w-fit basis-auto flex-col gap-0.5 pr-4"
            style={{ flexGrow: 1 }}
          >
            <span className="text-[14px] text-text-muted">Gastos</span>
            <span
              data-amount
              className={cn('whitespace-nowrap font-display font-extrabold text-expense', chipText)}
            >
              <AmountDisplay cents={-expenseCents} />
            </span>
          </Link>
          <Link
            to="/este-mes"
            aria-label="Ingresos del mes, ver el informe"
            className="flex min-w-fit basis-auto flex-col gap-0.5 border-l border-line pl-4"
            style={{ flexGrow: 1 }}
          >
            <span className="text-[14px] text-text-muted">Ingresos</span>
            <span
              data-amount
              className={cn('whitespace-nowrap font-display font-extrabold text-income', chipText)}
            >
              <AmountDisplay cents={incomeCents} signed />
            </span>
          </Link>
        </div>
      </section>
    </header>
  )
}
