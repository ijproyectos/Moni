import { Bell, Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router'
import { useNotifications } from '@/features/notifications/mock/notificationsStore'
import { FEATURES } from '@/shared/config/features'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { useHiddenAmounts } from '@/shared/ui/hiddenAmountsContext'
import { PhotoOrInitial } from '@/shared/ui/PhotoOrInitial'
import { MonthPicker } from '@/shared/ui/MonthPicker'
import type { Cents } from '@/shared/lib/money'
import type { IsoDate } from '@/shared/lib/month'

interface HomeHeaderProps {
  month: IsoDate
  latestMonth: IsoDate
  onMonthChange: (month: IsoDate) => void
  initial: string
  /** Google account photo (or null to show the initial). */
  photoUrl?: string | null
  /** Money on hand right now: cash, banks and wallets (no cards, archived accounts or savings goals). */
  availableCents: Cents
  balanceCents: Cents
  incomeCents: Cents
  expenseCents: Cents
  /** Reminders (e.g. tomorrow's charges) that add to the bell's count. */
  reminderCount?: number
}

export function HomeHeader({
  month,
  latestMonth,
  onMonthChange,
  initial,
  photoUrl = null,
  availableCents,
  balanceCents,
  incomeCents,
  expenseCents,
  reminderCount = 0,
}: HomeHeaderProps) {
  const { hidden, toggle } = useHiddenAmounts()
  const { unread: unreadNotices } = useNotifications()
  const unread = unreadNotices + reminderCount
  const total = incomeCents + expenseCents
  const expenseShare = total > 0 ? Math.max(expenseCents / total, 0.28) : 0.5
  const incomeShare = total > 0 ? Math.max(incomeCents / total, 0.28) : 0.5

  return (
    <header className="rounded-b-[40px] bg-forest px-5 pb-4 pt-10 text-cream">
      <div className="flex items-center justify-between gap-3">
        <MonthPicker value={month} latest={latestMonth} onChange={onMonthChange} />
        <div className="flex items-center gap-2">
          {FEATURES.notifications && (
            <Link
              to="/avisos"
              aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : 'Avisos'}
              className="relative flex size-12 items-center justify-center rounded-full bg-surface text-cream"
            >
              <Bell aria-hidden="true" className="size-6" strokeWidth={2} />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-blush text-[12px] font-extrabold text-forest">
                  {unread}
                </span>
              )}
            </Link>
          )}
          <Link
            to="/perfil"
            aria-label="Perfil"
            className="flex size-12 items-center justify-center rounded-full"
          >
            <PhotoOrInitial
              url={photoUrl}
              initial={initial}
              alt="Tu foto de perfil"
              className="size-12"
              fallbackClassName="bg-lime font-display text-xl font-extrabold text-forest"
            />
          </Link>
        </div>
      </div>

      <div className="mt-1 flex items-start justify-between gap-3">
        <Link
          to="/cuentas"
          aria-label="Ver tus medios de pago"
          className="min-w-0 flex-1 rounded-[20px] outline-offset-4"
        >
          <p className="text-[15px] text-text-muted-on-dark">Dinero disponible</p>
          <p className="flex items-baseline gap-1 font-display font-extrabold">
            <span className="text-[22px] text-lime">$</span>
            <AmountDisplay
              cents={availableCents}
              bare
              className="min-w-0 text-[clamp(30px,10vw,40px)] leading-[1.1] text-cream"
            />
          </p>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Mostrar montos' : 'Ocultar montos'}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted-on-dark"
        >
          {hidden ? (
            <EyeOff aria-hidden="true" className="size-6" strokeWidth={2} />
          ) : (
            <Eye aria-hidden="true" className="size-6" strokeWidth={2} />
          )}
        </button>
      </div>

      <section
        aria-label="Balance del mes"
        className="mt-2 rounded-[22px] bg-white/10 p-3 ring-1 ring-white/10"
      >
        <Link
          to="/este-mes"
          aria-label="Ver el informe del mes"
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
        >
          <span className="text-[15px] text-text-muted-on-dark">Balance del mes</span>
          <span className="flex items-baseline gap-1 font-display font-extrabold">
            <span className="text-[20px] text-lime">{balanceCents < 0 ? '-' : '+'}$</span>
            <AmountDisplay
              cents={balanceCents}
              bare
              className="text-[clamp(24px,8vw,32px)] leading-[1.15] text-cream"
            />
          </span>
        </Link>
        <div className="mt-2 flex gap-2" role="group" aria-label="Gastos e ingresos del mes">
          <div
            className="flex min-w-[7.25rem] basis-0 flex-col gap-1.5"
            style={{ flexGrow: expenseShare }}
          >
            <span className="flex h-10 items-center justify-center rounded-full bg-blush px-3 font-display text-[17px] font-extrabold text-forest">
              <AmountDisplay cents={-expenseCents} />
            </span>
            <span className="text-center text-[14px] text-text-muted-on-dark">Gastos</span>
          </div>
          <div
            className="flex min-w-[7.25rem] basis-0 flex-col gap-1.5"
            style={{ flexGrow: incomeShare }}
          >
            <span className="flex h-10 items-center justify-center rounded-full bg-lime px-3 font-display text-[17px] font-extrabold text-forest">
              <AmountDisplay cents={incomeCents} signed />
            </span>
            <span className="text-center text-[14px] text-text-muted-on-dark">Ingresos</span>
          </div>
        </div>
      </section>
    </header>
  )
}
