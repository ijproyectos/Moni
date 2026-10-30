import { ChevronRight, CreditCard, Gift, Heart, Plus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/shared/ui/Button'
import mascotAssistant from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import { FEATURES } from '@/shared/config/features'
import { formatMonthShortYear } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { EmptyState } from '@/shared/ui/EmptyState'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
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
import { useSavings } from '../api/useSavings'
import { activeTotals, goalsByStatus, type SavingsGoal } from '../domain/savings'
import { useGoals } from '../mock/goalsStore'
import { SavingsHero } from './goalVisuals'
import { NewGoalSheet } from './NewGoalSheet'
import { SavingsGoalCard } from './SavingsGoalCard'
import { SavingsNotices } from './SavingsNotices'
import { SharedGoalSheet } from './SharedGoalSheet'

type Tab = 'mine' | 'shared'

// Screens 023 / 024 / 137 — Metas.
export function GoalsPage() {
  // Personal goals are real (Supabase); the shared ones are still a simulation.
  const sharedGoals = useGoals()
  const savings = useSavings()
  const [showOthers, setShowOthers] = useState(false)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [creatingShared, setCreatingShared] = useState(false)
  const shared = sharedGoals.filter((g) => g.shared)
  const all = savings.data?.goals ?? []
  const active = goalsByStatus(all, 'active')
  const others = goalsByStatus(all, 'paused', 'completed', 'archived')
  const tab: Tab =
    FEATURES.sharedGoals && params.get('tab') === 'shared' && shared.length > 0 ? 'shared' : 'mine'
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
          <SavingsNotices />
          {active.length > 0 && <MineSummary goals={all} />}
          {FEATURES.sharedGoals && (
            <>
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
            </>
          )}
          <div className={FEATURES.aguinaldo ? 'grid grid-cols-2 gap-3' : 'grid gap-3'}>
            <Link
              to="/metas/cuotas"
              className="flex min-w-0 items-center gap-2 rounded-[22px] border border-sand bg-white px-3 py-3"
            >
              <IconTile icon={CreditCard} bg="#fdeab8" className="size-11 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[17px] font-extrabold leading-5">Cuotas</span>
                <span className="block text-[14px] text-text-muted">¿Conviene?</span>
              </span>
            </Link>
            {FEATURES.aguinaldo && (
              <Link
                to="/aguinaldo"
                className="flex min-w-0 items-center gap-2 rounded-[22px] border border-sand bg-white px-3 py-3"
              >
                <IconTile icon={Gift} bg="#e3f2cf" className="size-11 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[17px] font-extrabold leading-5">Aguinaldo</span>
                  <span className="block text-[14px] text-text-muted">Repartilo</span>
                </span>
              </Link>
            )}
          </div>
          {savings.isLoading ? (
            <div role="status" aria-label="Cargando metas" className="flex flex-col gap-3">
              <Skeleton className="h-40" />
              <Skeleton className="h-36" />
            </div>
          ) : savings.isError ? (
            <EmptyState
              mascotUrl={mascotAssistant}
              title="No pudimos cargar tus metas"
              description={
                (savings.error as { code?: string } | null)?.code === 'PGRST202'
                  ? toUserMessage(savings.error)
                  : 'Revisá tu conexión y probá de nuevo.'
              }
              action={<Button onClick={() => void savings.refetch()}>Reintentar</Button>}
            />
          ) : (
            <>
              {all.length === 0 && (
                <div className="rounded-[24px] border border-sand bg-white p-4">
                  <EmptyState
                    mascotUrl={mascotAssistant}
                    title="Todavía no tenés metas"
                    description="Reservá plata de tus cuentas para un viaje, un auto o tu fondo de emergencia. La plata no sale de tu cuenta."
                    action={
                      <Button onClick={() => setCreating(true)}>Crear mi primera meta</Button>
                    }
                  />
                </div>
              )}
              <ul className="flex flex-col gap-4">
                {active.map((goal) => (
                  <li key={goal.id}>
                    <SavingsGoalCard
                      goal={goal}
                      today={savings.data?.today ?? today}
                      onOpen={() => navigate(`/metas/${goal.id}`)}
                    />
                  </li>
                ))}
              </ul>
              {others.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={showOthers}
                    onClick={() => setShowOthers((v) => !v)}
                    className="min-h-11 self-start text-[16px] font-extrabold text-forest underline"
                  >
                    {showOthers ? 'Ocultar' : 'Ver'} pausadas, completadas y archivadas (
                    {others.length})
                  </button>
                  {showOthers && (
                    <ul className="flex flex-col gap-4">
                      {others.map((goal) => (
                        <li key={goal.id}>
                          <SavingsGoalCard
                            goal={goal}
                            today={savings.data?.today ?? today}
                            onOpen={() => navigate(`/metas/${goal.id}`)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
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
      {FEATURES.sharedGoals && creatingShared && (
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

function MineSummary({ goals }: { goals: SavingsGoal[] }) {
  const { reservedCents, targetCents, count } = activeTotals(goals)
  const value = targetCents > 0 ? Math.min(1, reservedCents / targetCents) : 0
  return (
    <SavingsHero
      label="Reservado para tus metas"
      savedCents={reservedCents}
      targetCents={targetCents}
      progressValue={value}
      footer={`${percentLabel(value)} de tus ${count} ${count === 1 ? 'meta activa' : 'metas activas'}. La plata sigue en tus cuentas.`}
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
