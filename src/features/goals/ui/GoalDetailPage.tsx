import { Navigate, useParams } from 'react-router'
import { useState } from 'react'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { formatDayMonth, formatMonthShortYear, formatShortDate } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { Avatar, MoniCalcCard, MoniGlyph, Page, Panel, ProgressBar } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import {
  monthlyNeeded,
  monthsUntil,
  percentLabel,
  progress,
  splitMonthly,
  type Goal,
} from '../domain/goals'
import { updateShared, useGoal } from '../mock/goalsStore'
import { ContributeSheet } from './ContributeSheet'
import { GoalInviteSheet } from './GoalInviteSheet'
import { SavingsHero } from './goalVisuals'
import { SplitPanel } from './SplitPanel'

// Screens 028 (personal) / 045 / 134 (shared) — detalle de meta.
export function GoalDetailPage() {
  const { id } = useParams()
  const goal = useGoal(id)
  const [contributing, setContributing] = useState(false)
  if (!goal) return <Navigate to="/metas" replace />
  return goal.shared ? (
    <SharedGoalDetail
      goal={goal}
      info={goal.shared}
      contributing={contributing}
      setContributing={setContributing}
    />
  ) : (
    <PersonalGoalDetail goal={goal} contributing={contributing} setContributing={setContributing} />
  )
}

interface DetailProps {
  goal: Goal
  contributing: boolean
  setContributing: (v: boolean) => void
}

function PersonalGoalDetail({ goal, contributing, setContributing }: DetailProps) {
  const today = todayIso()
  const monthly = monthlyNeeded(goal, today)
  const months = monthsUntil(today, goal.dueDate)
  const value = progress(goal)
  return (
    <Page>
      <PageHeader title={goal.name} backTo="/metas" />
      <SavingsHero
        label={`Para el ${formatShortDate(goal.dueDate)}`}
        savedCents={goal.savedCents}
        targetCents={goal.targetCents}
        progressValue={value}
        footer={
          <span className="flex justify-between font-extrabold">
            <span>{percentLabel(value)} juntado</span>
            <span>Faltan {formatArs(Math.max(0, goal.targetCents - goal.savedCents))}</span>
          </span>
        }
      />
      <MoniCalcCard tone="light" title={`${formatArs(monthly)} por mes`}>
        durante {months} {months === 1 ? 'mes' : 'meses'} y llegás
      </MoniCalcCard>
      <Button onClick={() => setContributing(true)}>Aportar</Button>
      <Panel>
        <h2 className="text-[20px] font-extrabold">Aportes</h2>
        {goal.contributions.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-muted">Todavía no hay aportes.</p>
        ) : (
          <ul className="mt-1 divide-y divide-sand">
            {goal.contributions.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-lime/35">
                  <MoniGlyph />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-extrabold">{c.label}</span>
                  <span className="block text-[15px] text-text-muted">
                    {formatDayMonth(c.date)} · {c.source}
                  </span>
                </span>
                <span className="text-[17px] font-extrabold text-income">
                  {formatArs(c.cents, { signed: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {contributing && (
        <ContributeSheet
          goal={goal}
          suggestedCents={monthly}
          onClose={() => setContributing(false)}
        />
      )}
    </Page>
  )
}

function SharedGoalDetail({
  goal,
  info,
  contributing,
  setContributing,
}: DetailProps & { info: NonNullable<Goal['shared']> }) {
  const today = todayIso()
  const [inviting, setInviting] = useState(false)
  const monthly = monthlyNeeded(goal, today)
  const [mine, theirs] = splitMonthly(monthly, info.split, info.incomeShare)
  const value = progress(goal)
  const people = [
    { name: 'Vos', month: info.monthMineCents, due: mine, total: info.mineCents },
    { name: info.partner, month: info.monthTheirsCents, due: theirs, total: info.theirsCents },
  ]
  return (
    <Page>
      <PageHeader title="Meta compartida" backTo="/metas?tab=shared" />
      <SavingsHero
        label={`${info.space} · ${goal.name}`}
        savedCents={goal.savedCents}
        targetCents={goal.targetCents}
        progressValue={value}
        footer={
          <span className="flex justify-between font-extrabold">
            <span>{percentLabel(value)} juntado</span>
            <span>Faltan {formatArs(Math.max(0, goal.targetCents - goal.savedCents))}</span>
          </span>
        }
      >
        <Button className="mt-4" onClick={() => setContributing(true)}>
          Aportar a la meta
        </Button>
      </SavingsHero>
      <MoniCalcCard tone="light" mascot={mascotGroup} title={`${formatArs(monthly)} por mes`}>
        {info.split === 'half'
          ? `entre los dos (${formatArs(mine)} cada uno), y llegan en ${formatMonthShortYear(goal.dueDate)}`
          : `entre los dos (Vos ${formatArs(mine)} · ${info.partner} ${formatArs(theirs)}), y llegan en ${formatMonthShortYear(goal.dueDate)}`}
      </MoniCalcCard>
      {info.pending && (
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="rounded-[18px] bg-gold/40 px-4 py-3 text-left text-[15px] font-bold"
        >
          {info.partner} todavía no entró. Tocá para reenviarle el código {info.inviteCode}.
        </button>
      )}
      <SplitPanel
        mode={info.split}
        onModeChange={(split) => updateShared(goal.id, { split })}
        partner={info.partner}
        mineCents={mine}
        theirsCents={theirs}
        incomeShare={info.incomeShare}
      />
      <Panel>
        <ul className="divide-y divide-sand">
          {people.map((p) => {
            const done = p.month >= p.due
            return (
              <li key={p.name} className="py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={p.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[18px] font-extrabold">{p.name}</span>
                    <span className="block text-[15px] leading-5 text-text-muted">
                      Este mes {formatArs(p.month)} de {formatArs(p.due)} ·{' '}
                      {done ? 'listo' : `faltan ${formatArs(p.due - p.month)}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[18px] font-extrabold">{formatArs(p.total)}</span>
                    <span className="block text-[14px] text-text-muted">aportado</span>
                  </span>
                </div>
                <ProgressBar value={p.due > 0 ? p.month / p.due : 0} className="mt-3" />
              </li>
            )
          })}
        </ul>
      </Panel>
      {contributing && (
        <ContributeSheet
          goal={goal}
          suggestedCents={Math.max(0, mine - info.monthMineCents) || mine}
          onClose={() => setContributing(false)}
        />
      )}
      {inviting && (
        <GoalInviteSheet
          partner={info.partner}
          code={info.inviteCode}
          goalName={goal.name}
          moment="after"
          onClose={() => setInviting(false)}
          onDone={() => setInviting(false)}
        />
      )}
    </Page>
  )
}
