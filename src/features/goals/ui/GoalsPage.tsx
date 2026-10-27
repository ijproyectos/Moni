import { ChevronRight, CreditCard, Gift, Heart, Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { formatMonthShortYear, formatShortDate } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import {
  Avatar,
  DashedButton,
  HeaderAddButton,
  IconTile,
  MoniSays,
  Page,
  ProgressBar,
} from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { monthlyNeeded, percentLabel, progress, splitMonthly, type Goal } from '../domain/goals'
import { useGoals } from '../mock/goalsStore'
import { GOAL_ICONS } from './goalIcons'
import { SavingsHero } from './goalVisuals'
import { NewGoalSheet } from './NewGoalSheet'
import { SharedGoalSheet } from './SharedGoalSheet'

type Tab = 'mine' | 'shared'

// Screens 023 / 024 / 137 — Metas.
export function GoalsPage() {
  const goals = useGoals()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [creatingShared, setCreatingShared] = useState(false)
  const mine = goals.filter((g) => !g.shared)
  const shared = goals.filter((g) => g.shared)
  const tab: Tab = params.get('tab') === 'shared' && shared.length > 0 ? 'shared' : 'mine'
  const today = todayIso()

  return (
    <Page>
      <PageHeader
        title="Metas"
        backTo="/mas"
        action={<HeaderAddButton label="Nueva meta" onClick={() => setCreating(true)} />}
      />

      {shared.length > 0 && tab === 'shared' && (
        <SegmentedControl
          label="Tipo de metas"
          value={tab}
          onChange={(t) => setParams(t === 'shared' ? { tab: 'shared' } : {}, { replace: true })}
          options={[
            { value: 'mine', label: 'Mías' },
            { value: 'shared', label: 'Compartidas' },
          ]}
        />
      )}

      {tab === 'mine' ? (
        <>
          <MineSummary goals={mine} />
          {shared[0] ? (
            <SharedTeaser
              goal={shared[0]}
              onOpen={() => setParams({ tab: 'shared' }, { replace: true })}
            />
          ) : (
            <button
              type="button"
              onClick={() => setCreatingShared(true)}
              className="flex min-h-[76px] w-full items-center gap-3 rounded-[22px] border-2 border-dashed border-[#d9c9a6] px-4 text-left"
            >
              <IconTile icon={UsersRound} bg="#d9ebe4" />
              <span className="flex-1">
                <span className="block text-[18px] font-extrabold">Compartidas</span>
                <span className="block text-[14px] text-text-muted">
                  Armá una meta con tu pareja o familia
                </span>
              </span>
              <Plus aria-hidden="true" className="size-6" />
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/metas/cuotas"
              className="flex items-center gap-3 rounded-[22px] border border-sand bg-white px-3 py-3"
            >
              <IconTile icon={CreditCard} bg="#fdeab8" className="size-11" />
              <span>
                <span className="block text-[17px] font-extrabold leading-5">Cuotas</span>
                <span className="block text-[14px] text-text-muted">¿Conviene?</span>
              </span>
            </Link>
            <Link
              to="/aguinaldo"
              className="flex items-center gap-3 rounded-[22px] border border-sand bg-white px-3 py-3"
            >
              <IconTile icon={Gift} bg="#e3f2cf" className="size-11" />
              <span>
                <span className="block text-[17px] font-extrabold leading-5">Aguinaldo</span>
                <span className="block text-[14px] text-text-muted">Repartilo</span>
              </span>
            </Link>
          </div>
          <ul className="flex flex-col gap-4">
            {mine.map((goal) => (
              <li key={goal.id}>
                <GoalCard goal={goal} today={today} onOpen={() => navigate(`/metas/${goal.id}`)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          {shared.map((goal) => (
            <SharedOverview key={goal.id} goal={goal} today={today} />
          ))}
          <DashedButton onClick={() => setCreatingShared(true)}>
            <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            Nueva meta con tu pareja
          </DashedButton>
        </>
      )}

      {creating && <NewGoalSheet onClose={() => setCreating(false)} />}
      {creatingShared && (
        <SharedGoalSheet
          onClose={() => setCreatingShared(false)}
          onCreated={() => {
            setCreatingShared(false)
            setParams({ tab: 'shared' }, { replace: true })
          }}
        />
      )}
    </Page>
  )
}

function MineSummary({ goals }: { goals: Goal[] }) {
  const saved = goals.reduce((s, g) => s + g.savedCents, 0)
  const target = goals.reduce((s, g) => s + g.targetCents, 0)
  const value = target > 0 ? saved / target : 0
  return (
    <SavingsHero
      label="Ya juntaste"
      savedCents={saved}
      targetCents={target}
      progressValue={value}
      footer={`${percentLabel(value)} de tus ${goals.length} metas activas`}
    />
  )
}

function SharedTeaser({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[80px] w-full items-center gap-3 rounded-[22px] border border-sand bg-white px-4 py-3 text-left"
    >
      <IconTile icon={Heart} bg="#fbdcd7" color="#b8321f" />
      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-extrabold">Compartidas</span>
        <span className="block text-[15px] leading-5 text-text-muted">
          {goal.name} · con {goal.shared?.partner}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-[18px] font-extrabold">{percentLabel(progress(goal))}</span>
        <span className="block text-[14px] text-text-muted">{formatArs(goal.savedCents)}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
    </button>
  )
}

export function GoalCard({
  goal,
  today,
  onOpen,
}: {
  goal: Goal
  today: string
  onOpen: () => void
}) {
  const visual = GOAL_ICONS[goal.icon]
  const value = progress(goal)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full rounded-[24px] border border-sand bg-white p-4 text-left"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={visual.icon} bg={visual.bg} color={visual.color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[19px] font-extrabold">{goal.name}</span>
          <span className="block text-[15px] text-text-muted">
            Para el {formatShortDate(goal.dueDate)}
          </span>
        </span>
        <span className="font-display text-[24px] font-extrabold">{percentLabel(value)}</span>
      </div>
      <ProgressBar value={value} className="mt-4" label={`Avance de ${goal.name}`} />
      <div className="mt-2 flex justify-between text-[15px] text-text-muted">
        <span>Juntaste {formatArs(goal.savedCents)}</span>
        <span>de {formatArs(goal.targetCents)}</span>
      </div>
      <MoniSays className="mt-3">
        ahorrá {formatArs(monthlyNeeded(goal, today))} por mes y llegás.
      </MoniSays>
    </button>
  )
}

function SharedOverview({ goal, today }: { goal: Goal; today: string }) {
  const info = goal.shared
  if (!info) return null
  const value = progress(goal)
  const monthly = monthlyNeeded(goal, today)
  const [, theirs] = splitMonthly(monthly, info.split, info.incomeShare)
  const missingTheirs = Math.max(0, theirs - info.monthTheirsCents)
  return (
    <>
      <SavingsHero
        label="Entre los dos juntaron"
        savedCents={goal.savedCents}
        targetCents={goal.targetCents}
        progressValue={value}
        aside={
          <span className="flex -space-x-2">
            <Avatar name="Vos" size="sm" className="ring-2 ring-forest" />
            <Avatar name={info.partner} size="sm" className="ring-2 ring-forest" />
          </span>
        }
        footer={`Vos ${formatArs(info.mineCents)} · ${info.partner} ${formatArs(info.theirsCents)}`}
      />
      <Link
        to={`/metas/${goal.id}`}
        className="block rounded-[24px] border border-sand bg-white p-4"
      >
        <div className="flex items-center gap-3">
          <IconTile icon={Heart} bg="#fbdcd7" color="#b8321f" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[19px] font-extrabold">{goal.name}</span>
            <span className="block text-[15px] text-text-muted">
              Con {info.partner} · para {formatMonthShortYear(goal.dueDate)}
            </span>
          </span>
          <span className="font-display text-[24px] font-extrabold">{percentLabel(value)}</span>
        </div>
        <ProgressBar value={value} className="mt-4" />
        <div className="mt-2 flex justify-between text-[15px] text-text-muted">
          <span>Juntaron {formatArs(goal.savedCents)}</span>
          <span>de {formatArs(goal.targetCents)}</span>
        </div>
        <MoniSays className="mt-3">
          {missingTheirs > 0
            ? `a ${info.partner} le faltan ${formatArs(missingTheirs)} para llegar a su parte de este mes.`
            : `los dos ya pusieron su parte de este mes.`}
        </MoniSays>
      </Link>
    </>
  )
}
