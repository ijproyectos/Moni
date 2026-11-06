import { useState } from 'react'
import { Link } from 'react-router'
import mascotAssistant from '@/assets/mascot/personaje_asistente.svg'
import mascotAnalyst from '@/assets/mascot/expresion_analista.svg'
import { useAnts } from '@/features/insights/api/useAnts'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { AntIcon } from '@/shared/ui/AntIcon'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { CompactHeader } from '@/shared/ui/CompactHeader'
import { useScrolledPast } from '@/shared/ui/useScrolledPast'
import { EmptyState } from '@/shared/ui/EmptyState'
import type { BalancePoint } from '../domain/balanceSeries'
import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import type { Story } from '../domain/stories'
import { HomeHeader } from './HomeHeader'
import { RecentMovements, type MovementActions } from './RecentMovements'
import { SpendingBreakdown } from './SpendingBreakdown'
import { StoriesRow } from './StoriesRow'
import { StoryViewer } from './StoryViewer'
import { useStorySeen } from './storySeen'

interface HomeScreenProps {
  /** Everything about the current month: totals, categories. */
  summary: MonthSummary
  /** Newest movements across the whole history. Defaults to the month's own. */
  movements?: readonly RecentMovement[]
  /** How many movements there are in all (for "Ver los N"). */
  movementsTotal?: number
  /** Edit and void from the list; without it the rows are plain. */
  movementActions?: MovementActions
  initial: string
  /** First name for the greeting. */
  name?: string | null
  /** Who is looking: the stories that were already seen are remembered per person. */
  userId?: string
  photoUrl?: string | null
  /** Moni Plus is running right now: shows the PLUS badge on the avatar. */
  isPlus?: boolean
  onAddMovement: () => void
  /** Whether the person has Hormigas turned on (it still needs real expenses to show its card). */
  shortcuts?: { ants: boolean }
  /** Reminders counted next to the unread notices on the bell. */
  reminderCount?: number
  /** Unread notices of groups (debt reminders, payments to confirm). */
  noticeCount?: number
  /** Daily available money (the series behind the old sparkline). Inicio no longer draws it, but the data stays available. */
  balanceSeries?: readonly BalancePoint[] | null
  /** "Para hoy": what Moni has to tell, from the person's real data. */
  stories?: readonly Story[]
}

export function HomeScreen({
  summary,
  movements,
  movementsTotal,
  movementActions,
  initial,
  name = null,
  userId = 'anonymous',
  photoUrl,
  isPlus,
  onAddMovement,
  shortcuts = { ants: true },
  reminderCount = 0,
  noticeCount = 0,
  stories = [],
}: HomeScreenProps) {
  const { isSeen, markSeen } = useStorySeen(userId)
  const [openStory, setOpenStory] = useState<number | null>(null)
  const recent = movements ?? summary.recent
  const hasData =
    summary.byCategory.length > 0 ||
    recent.length > 0 ||
    summary.incomeCents > 0 ||
    summary.expenseCents > 0
  const [balanceRef, scrolled] = useScrolledPast<HTMLDivElement>()

  return (
    <div>
      <CompactHeader title="Inicio" visible={scrolled} />
      <HomeHeader
        initial={initial}
        photoUrl={photoUrl}
        isPlus={isPlus}
        name={name}
        availableCents={summary.availableBalanceCents}
        incomeCents={summary.incomeCents}
        expenseCents={summary.expenseCents}
        reminderCount={reminderCount}
        noticeCount={noticeCount}
      />
      {/* Marks the end of the big header: once it leaves the screen the compact one shows. */}
      <div ref={balanceRef} aria-hidden="true" className="h-px" />

      {stories.length > 0 && (
        <section aria-labelledby="today-title" className="border-t border-line px-5 py-4">
          <h2 id="today-title" className="mb-3 font-display text-[22px] font-extrabold">
            Para hoy
          </h2>
          <StoriesRow stories={stories} isSeen={isSeen} onOpen={setOpenStory} />
        </section>
      )}
      {openStory !== null && (
        <StoryViewer
          stories={stories}
          startIndex={openStory}
          onClose={() => setOpenStory(null)}
          onViewed={markSeen}
        />
      )}

      {!hasData ? (
        <div className="px-4 pt-4">
          <Card>
            <EmptyState
              mascotUrl={mascotAssistant}
              title="Todavía no hay movimientos"
              description="Cargá tu primer gasto o ingreso y Moni arma el resumen."
              action={<Button onClick={onAddMovement}>Cargar movimiento</Button>}
            />
          </Card>
        </div>
      ) : (
        <>
          <section aria-labelledby="spent-title" className="border-t border-line py-5">
            <div className="mb-3 flex items-baseline justify-between gap-3 px-5">
              <h2
                id="spent-title"
                className="whitespace-nowrap font-display text-[22px] font-extrabold"
              >
                En qué se fue
              </h2>
              {summary.byCategory.length > 0 && (
                <AmountDisplay
                  cents={summary.expenseCents}
                  className="font-display text-[20px] font-extrabold"
                />
              )}
            </div>
            {summary.byCategory.length > 0 ? (
              <SpendingBreakdown slices={summary.byCategory} />
            ) : (
              <div className="px-5">
                <EmptyState
                  mascotUrl={mascotAnalyst}
                  title="Sin gastos este mes"
                  description="Cuando cargues gastos, acá ves en qué categorías se van."
                />
              </div>
            )}
            <Link
              to="/actividad"
              className="mt-2 flex min-h-11 items-center justify-center text-[15px] text-text-muted"
            >
              Ver movimientos
            </Link>
          </section>

          <HomeAnts enabled={shortcuts.ants} />

          {recent.length > 0 && (
            <RecentMovements movements={recent} total={movementsTotal} actions={movementActions} />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Hormigas shortcut: there only when the feature is on and there are real ant expenses this month (no $0 filler: the
 * screen stays one tap away from Más).
 */
function HomeAnts({ enabled }: { enabled: boolean }) {
  const ants = useAnts(todayIso())
  const total = ants.data?.monthTotalCents ?? 0
  if (!enabled || total <= 0) return null
  return (
    <section className="border-t border-line px-5 py-4">
      <Link to="/hormigas" className="flex items-center gap-3">
        <AntIcon aria-hidden="true" className="size-6" strokeWidth={2.25} />
        <span className="flex-1 text-[17px] font-extrabold">Hormigas</span>
        <span className="text-right">
          <span className="block font-display text-[18px] font-extrabold leading-6">
            {formatArs(total)}
          </span>
          <span className="block text-[13px] text-text-muted">este mes</span>
        </span>
      </Link>
    </section>
  )
}
