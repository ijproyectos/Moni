import { ChevronRight, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { MonthSummary, RecentMovement } from '../domain/monthSummary'
import type { Story } from '../domain/stories'
import type { DailyAllowanceView } from '../api/useDailyAllowance'
import { HomeCapture } from './HomeCapture'
import { HomeHeader } from './HomeHeader'
import { HomeHero } from './HomeHero'
import { SharedExpensesCard, type SharedBalance } from './SharedExpensesCard'
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
  /** Reminders counted next to the unread notices on the bell. */
  reminderCount?: number
  /** Unread notices of groups (debt reminders, payments to confirm). */
  noticeCount?: number
  /** "Tu resumen de hoy": what Moni has to tell, from the person's real data. */
  stories?: readonly Story[]
  /** "Hoy podés gastar": the daily allowance of the month. Without it the hero is not drawn. */
  allowance?: DailyAllowanceView
  /** What the groups owe the person and vice versa; without it the shared expenses card is not drawn. */
  shared?: SharedBalance | null
  /** The microphone: opens the voice flow (Plus gate included). Without it the microphone is not offered. */
  onVoice?: () => void
  /** Voice needs a connection. */
  offline?: boolean
  /** Free plan: the microphone wears the Plus badge. */
  voicePlusBadge?: boolean
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
  reminderCount = 0,
  noticeCount = 0,
  stories = [],
  allowance,
  shared = null,
  onVoice,
  offline = false,
  voicePlusBadge = false,
  onAddIncome,
}: HomeScreenProps) {
  const { isSeen, markSeen } = useStorySeen(userId)
  const [openStory, setOpenStory] = useState<number | null>(null)
  const recent = movements ?? summary.recent

  return (
    <div>
      <HomeHeader
        initial={initial}
        photoUrl={photoUrl}
        isPlus={isPlus}
        name={name}
        reminderCount={reminderCount}
        noticeCount={noticeCount}
      />

      <div className="flex flex-col gap-2.5 pb-6 pt-1">
        {allowance && <HomeHero view={allowance} onAddIncome={onAddIncome ?? onAddMovement} />}
        <HomeCapture
          onVoice={onVoice}
          onManual={onAddMovement}
          offline={offline}
          voicePlusBadge={voicePlusBadge}
        />

        <Link
          to="/informes/asistente"
          className="mx-[18px] flex min-h-11 items-center gap-2.5 rounded-full bg-lilac-soft px-4 py-2 text-[14px] font-medium text-lilac-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink"
        >
          <MessageCircle aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={2} />
          <span className="flex-1">Preguntale a Moni: ¿me conviene?</span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>

        {stories.length > 0 && (
          <section aria-labelledby="today-title" className="mx-[18px] flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="today-title"
                className="font-display text-[16px] font-bold tracking-[-0.02em]"
              >
                Tu resumen de hoy
              </h2>
              <span className="text-[12px] text-text-muted">Moni · tocá para ver</span>
            </div>
            <StoriesRow stories={stories} isSeen={isSeen} onOpen={setOpenStory} />
          </section>
        )}
        {shared && <SharedExpensesCard shared={shared} to="/grupos" />}
        {recent.length > 0 ? (
          <RecentMovements movements={recent} actions={movementActions} variant="latest" />
        ) : (
          <section aria-labelledby="recent-title" className="mx-[18px] flex flex-col gap-2">
            <h2
              id="recent-title"
              className="font-display text-[17px] font-semibold tracking-[-0.02em]"
            >
              Últimos movimientos
            </h2>
            <p className="rounded-[26px] bg-card px-4 py-3 text-[14px] text-text-muted">
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
