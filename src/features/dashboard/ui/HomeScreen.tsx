import { useState } from 'react'
import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import type { Story } from '../domain/stories'
import type { Cents } from '@/shared/lib/money'
import type { DailyAllowanceView } from '../api/useDailyAllowance'
import { HomeAsk } from './HomeAsk'
import { HomeHeader } from './HomeHeader'
import { HomeHero } from './HomeHero'
import { RecentMovements, type MovementActions } from './RecentMovements'
import { StoriesRow } from './StoriesRow'
import { StoryViewer } from './StoryViewer'
import { useStorySeen } from './storySeen'

interface HomeScreenProps {
  /** Everything about the current month: totals, categories. */
  summary: MonthSummary
  /** Newest movements across the whole history. Defaults to the month's own. */
  movements?: readonly RecentMovement[]
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
  /** "Tu resumen de hoy": what Moni has to tell, from the person's real data. */
  stories?: readonly Story[]
  /** "Hoy podés gastar": the daily allowance of the month. Without it the hero is not drawn. */
  allowance?: DailyAllowanceView
  /** "Lo que tenés": the real sum of the payment methods and how many there are. */
  balance?: { totalCents: Cents; methodCount: number }
  /** Free plan: the assistant is Plus, so the question field wears the badge. */
  plusBadge?: boolean
  /** Empty hero action: starts loading an income. */
  onAddIncome?: () => void
}

export function HomeScreen({
  summary,
  movements,
  movementActions,
  initial,
  name = null,
  userId = 'anonymous',
  photoUrl,
  isPlus,
  onAddMovement,
  stories = [],
  allowance,
  balance = { totalCents: 0, methodCount: 0 },
  plusBadge = false,
  onAddIncome,
}: HomeScreenProps) {
  const { isSeen, markSeen } = useStorySeen(userId)
  const [openStory, setOpenStory] = useState<number | null>(null)
  const recent = movements ?? summary.recent

  return (
    <div className="-mb-[calc(env(safe-area-inset-bottom)+6rem)] min-h-dvh bg-[#F1EEDD] pb-[calc(env(safe-area-inset-bottom)+6rem)] dark:bg-canvas">
      <HomeHeader
        initial={initial}
        photoUrl={photoUrl}
        isPlus={isPlus}
        name={name}
      />

      <div className="flex flex-col gap-4 pb-6 pt-1">
        {allowance && (
          <HomeHero view={allowance} balance={balance} onAddIncome={onAddIncome ?? onAddMovement} />
        )}

        {stories.length > 0 && (
          <section aria-labelledby="today-title" className="mx-[18px]">
            <h2 id="today-title" className="sr-only">
              Tu resumen de hoy
            </h2>
            <StoriesRow stories={stories} isSeen={isSeen} onOpen={setOpenStory} />
          </section>
        )}
        <HomeAsk plusBadge={plusBadge} />
        {recent.length > 0 ? (
          <RecentMovements movements={recent} actions={movementActions} variant="latest" />
        ) : (
          <section aria-labelledby="recent-title" className="mx-[18px] flex flex-col gap-2">
            <h2
              id="recent-title"
              className="font-display text-[22px] font-extrabold tracking-[-0.02em] text-[#0B3D2E] dark:text-ink"
            >
              Últimos movimientos
            </h2>
            <p className="rounded-[28px] bg-[#FAF8EC] px-5 py-4 text-[15px] text-[#566A5C] dark:bg-card dark:text-text-muted">
              Todavía no hay movimientos. Cargá tu primer gasto o ingreso y aparece acá.
            </p>
          </section>
        )}
      </div>
      {openStory !== null && (
        <StoryViewer
          stories={stories}
          startIndex={openStory}
          onClose={() => setOpenStory(null)}
          onViewed={markSeen}
        />
      )}
    </div>
  )
}
