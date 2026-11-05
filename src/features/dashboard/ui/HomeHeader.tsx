import { Bell, Eye, EyeOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { ASSISTANT_PATH } from '@/features/assistant/ui/AssistantEntryLink'
import { useNotifications } from '@/features/notifications/mock/notificationsStore'
import { FEATURES } from '@/shared/config/features'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { MonthPicker } from '@/shared/ui/MonthPicker'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { formatArs, type Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

interface HomeHeaderProps {
  month: IsoDate
  latestMonth: IsoDate
  onMonthChange: (month: IsoDate) => void
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

/**
 * Text size of the Gastos / Ingresos chips. Both chips share it, so a long amount in one shrinks the pair together
 * (they read as a set) instead of squeezing or overlapping the text.
 */
/** Size of the big balance: it shrinks with the number of digits so a long amount never leaves the screen. */
function balanceSize(digits: number): string {
  if (digits <= 7) return 'text-[60px]'
  if (digits <= 9) return 'text-[52px]'
  if (digits <= 11) return 'text-[44px]'
  return 'text-[36px]'
}

function chipTextSize(longestAmount: number): string {
  if (longestAmount <= 12) return 'text-[26px]'
  if (longestAmount <= 14) return 'text-[22px]'
  if (longestAmount <= 17) return 'text-[19px]'
  return 'text-[16px]'
}

export function HomeHeader({
  month,
  latestMonth,
  onMonthChange,
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
  const chipText = chipTextSize(
    hidden
      ? 0
      : Math.max(formatArs(-expenseCents).length, formatArs(incomeCents, { signed: true }).length),
  )
  return (
    <header className="px-5 pb-2 pt-8 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <MonthPicker value={month} latest={latestMonth} onChange={onMonthChange} tone="light" />
          <h1 className="font-display text-[40px] font-extrabold leading-tight">
            {name ? `Hola, ${name}` : 'Hola'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {showBell && (
            <Link
              to={FEATURES.notifications ? '/avisos' : '/grupos/avisos'}
              aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
              className="relative flex size-12 items-center justify-center rounded-full bg-sand text-ink"
            >
              <Bell aria-hidden="true" className="size-6" strokeWidth={2} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-expense text-[12px] font-extrabold text-white">
                  {unread}
                </span>
              )}
            </Link>
          )}
          <Link
            to={ASSISTANT_PATH}
            aria-label="Preguntale a Moni"
            className="flex size-12 items-center justify-center overflow-hidden rounded-full bg-[#e3ebd3] dark:bg-sand"
          >
            <img src={mascotHappy} alt="" className="size-[42px] object-contain" />
          </Link>
          <Link
            to="/perfil"
            aria-label={isPlus ? 'Perfil, Moni Plus activo' : 'Perfil'}
            className="relative flex size-12 items-center justify-center rounded-full"
          >
            {isPlus && (
              <span
                data-plus-badge
                aria-hidden="true"
                className="pointer-events-none absolute -top-2.5 right-0 z-10 whitespace-nowrap rounded-full bg-gold px-1.5 text-[10px] font-extrabold leading-4 tracking-[0.08em] text-forest shadow-sm ring-2 ring-canvas"
              >
                ✦ PLUS
              </span>
            )}
            <PhotoOrInitial
              url={photoUrl}
              initial={initial}
              alt="Tu foto de perfil"
              className="size-12"
              fallbackClassName="bg-forest font-display text-xl font-extrabold text-cream dark:bg-lime dark:text-forest"
            />
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <Link
          to="/cuentas"
          aria-label="Ver tus medios de pago"
          className="min-w-0 flex-1 rounded-[20px] outline-offset-4"
        >
          <p className="text-[20px] font-bold text-text-muted">Dinero disponible</p>
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
                'self-start pt-2 text-[30px]',
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
            <EyeOff aria-hidden="true" className="size-6" strokeWidth={2} />
          ) : (
            <Eye aria-hidden="true" className="size-6" strokeWidth={2} />
          )}
        </button>
      </div>

      {chart && <div className="-mx-5">{chart}</div>}

      <section aria-label="Gastos e ingresos del mes" className="mt-2">
        <div className="flex" role="group" aria-label="Gastos e ingresos del mes">
          <Link
            to="/este-mes"
            aria-label="Gastos del mes, ver el informe"
            className="flex min-w-fit basis-auto flex-col gap-0.5 pr-4"
            style={{ flexGrow: 1 }}
          >
            <span className="text-[15px] text-text-muted">Gastos</span>
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
            <span className="text-[15px] text-text-muted">Ingresos</span>
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
