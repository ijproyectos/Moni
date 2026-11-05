import type { BudgetStatus } from '@/features/budgets/domain/budget'
import type { PendingDebt } from '@/features/debts/domain/debts'
import type { PlanNow } from '@/features/goals/domain/savingsPlan'
import { formatDayMonth } from '@/shared/lib/dates'
import { formatArs, formatCompact, type Cents } from '@/shared/lib/money'
import { addDays, type IsoDate } from '@/shared/lib/month'

/** Ring and fill of the bubble; each story picks the one that fits what it tells. */
export type StoryTone = 'gold' | 'blush' | 'blue' | 'violet' | 'green'

/** Interactive content a slide hosts as is, so its actions (add a contribution, postpone, skip, hide) stay available. */
export type StoryEmbed = 'savings-notices' | 'recurring-reminders'

export interface StorySlide {
  title: string
  /** The big figure of the slide (an amount, a percentage). */
  figure?: string
  /** What Moni says, in a sentence. */
  body: string
  /** A few supporting lines (who owes what, which charges). */
  lines?: string[]
  action?: { label: string; to: string }
  embed?: StoryEmbed
}

export interface Story {
  /** Stable per kind (and group). */
  id: string
  /** Changes when what the story says changes, so a story that was seen comes back as new when it has news. */
  signature: string
  /** Name under the bubble. */
  label: string
  /** The short content inside the bubble. */
  bubble: string
  tone: StoryTone
  /** Lower is shown first: 1 notices and due dates, 2 debts, 3 goals and limits, 4 spending, 5 achievements. */
  priority: number
  slides: StorySlide[]
}

export interface StoryInput {
  today: IsoDate
  /** "noviembre": the month the spending is about. */
  monthName: string
  /** Recurring payment reminders still open (the ones the person did not hide). */
  reminders: readonly { key: string; text: string; to: string }[]
  /** Savings alerts plus goal reminders waiting for an answer. */
  savingsNoticeCount: number
  /** Unread notices of groups. */
  groupNoticeCount: number
  /** Where those notices live. */
  noticesPath: string
  debts: readonly Pick<
    PendingDebt,
    'key' | 'groupId' | 'groupName' | 'direction' | 'otherName' | 'amountCents' | 'report'
  >[]
  /** Where the debts overview lives (null when it is not available: the groups list stands in). */
  debtsPath: string
  spending: {
    expenseCents: Cents
    byCategory: readonly { name: string; amountCents: Cents; percent: number }[]
    /** The previous month's expenses; only given when the picked month is over, so both are whole months. */
    previousExpenseCents: Cents | null
    previousMonthName: string
    /** Days the month has run (today's day, or the whole month once it is over): the daily average divides by it. */
    daysCounted?: number
  }
  goals: {
    plan: PlanNow | null
    reservedCents: Cents
    targetCents: Cents
    count: number
  }
  subscriptions: readonly {
    id: string
    name: string
    amountCents: Cents
    nextChargeOn: IsoDate
    period?: 'monthly' | 'yearly'
  }[]
  budgets: readonly Pick<
    BudgetStatus,
    'budgetId' | 'name' | 'state' | 'percent' | 'remainingCents'
  >[]
  /** Badges earned in the last days. */
  badges: readonly { key: string; name: string; earnedOn: IsoDate }[]
}

const SUBSCRIPTION_DAYS = 7
const BADGE_DAYS = 14
const NEAR_DONE = 0.9
const MAX_LINES = 3

const cap = (text: string, max = 12) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const people = (n: number) => `${n} ${n === 1 ? 'persona' : 'personas'}`

function sum(items: readonly { amountCents: Cents }[]): Cents {
  return items.reduce((s, i) => s + i.amountCents, 0)
}

function debtLines(debts: readonly Pick<PendingDebt, 'otherName' | 'groupName' | 'amountCents'>[]) {
  return debts
    .slice()
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, MAX_LINES)
    .map((d) => `${d.otherName} · ${d.groupName} · ${formatArs(d.amountCents)}`)
}

/**
 * The stories of Inicio, from the person's real data: only what applies today, most urgent first. Nothing here invents a
 * figure; every amount, name and date comes from the input.
 */
export function buildStories(input: StoryInput): Story[] {
  const stories: Story[] = []
  const add = (story: Story) => stories.push(story)

  // 1. Notices and due dates ----------------------------------------------------------------------------------------
  if (input.reminders.length > 0) {
    add({
      id: 'recordatorios',
      signature: input.reminders.map((r) => r.key).join(','),
      label: 'Recordatorios',
      bubble: String(input.reminders.length),
      tone: 'gold',
      priority: 1,
      slides: [
        {
          title: 'Pagos que se acercan',
          body:
            input.reminders.length === 1
              ? 'Tenés un pago para tener presente.'
              : `Tenés ${input.reminders.length} pagos para tener presentes.`,
          embed: 'recurring-reminders',
          action: { label: 'Ver pagos recurrentes', to: '/recurrentes' },
        },
      ],
    })
  }

  if (input.savingsNoticeCount > 0) {
    add({
      id: 'ahorro',
      signature: String(input.savingsNoticeCount),
      label: 'Ahorro',
      bubble: String(input.savingsNoticeCount),
      tone: 'gold',
      priority: 1,
      slides: [
        {
          title: 'Tu ahorro te espera',
          body: 'Moni no aporta ni descuenta nada sola: elegí qué hacer con cada aviso.',
          embed: 'savings-notices',
        },
      ],
    })
  }

  if (input.groupNoticeCount > 0) {
    add({
      id: 'avisos',
      signature: String(input.groupNoticeCount),
      label: 'Avisos',
      bubble: String(input.groupNoticeCount),
      tone: 'blush',
      priority: 1,
      slides: [
        {
          title:
            input.groupNoticeCount === 1
              ? 'Tenés un aviso'
              : `Tenés ${input.groupNoticeCount} avisos`,
          body: 'Recordatorios de deudas o pagos de tus grupos que esperan tu respuesta.',
          action: { label: 'Ver avisos', to: input.noticesPath },
        },
      ],
    })
  }

  const horizon = addDays(input.today, SUBSCRIPTION_DAYS)
  const upcoming = input.subscriptions
    // A charge that is already a reminder is told once.
    .filter((s) => !input.reminders.some((r) => r.key === `sub-${s.id}`))
    .filter((s) => s.nextChargeOn >= input.today && s.nextChargeOn <= horizon)
    .sort((a, b) => a.nextChargeOn.localeCompare(b.nextChargeOn))
  const nextCharge = upcoming[0]
  // Only monthly charges add up to "per month": a yearly one would need an estimate, so it is left out.
  const monthly = input.subscriptions.filter((s) => (s.period ?? 'monthly') === 'monthly')
  const monthlySlides: StorySlide[] =
    monthly.length >= 2
      ? [
          {
            title: 'Tus suscripciones',
            figure: formatArs(sum(monthly)),
            body: `Entre ${monthly.length} suscripciones mensuales activas pagás ${formatArs(sum(monthly))} por mes.`,
            lines: monthly
              .slice()
              .sort((a, b) => b.amountCents - a.amountCents)
              .slice(0, MAX_LINES)
              .map((s) => `${s.name} · ${formatArs(s.amountCents)}`),
            action: { label: 'Ver pagos recurrentes', to: '/recurrentes' },
          },
        ]
      : []
  if (nextCharge) {
    const when =
      nextCharge.nextChargeOn === input.today
        ? 'hoy'
        : nextCharge.nextChargeOn === addDays(input.today, 1)
          ? 'mañana'
          : `el ${formatDayMonth(nextCharge.nextChargeOn)}`
    add({
      id: 'suscripciones',
      signature: upcoming.map((s) => `${s.id}:${s.nextChargeOn}:${s.amountCents}`).join(','),
      label: cap(nextCharge.name),
      bubble: String(Number(nextCharge.nextChargeOn.slice(8, 10))),
      tone: 'violet',
      priority: 1,
      slides: [
        {
          title: 'Se acerca un cobro',
          figure: formatArs(nextCharge.amountCents),
          body: `${nextCharge.name} se cobra ${when}.`,
          lines:
            upcoming.length > 1
              ? upcoming
                  .slice(1, 1 + MAX_LINES)
                  .map(
                    (s) =>
                      `${s.name} · ${formatDayMonth(s.nextChargeOn)} · ${formatArs(s.amountCents)}`,
                  )
              : undefined,
          action: { label: 'Ver pagos recurrentes', to: '/recurrentes' },
        },
        ...monthlySlides,
      ],
    })
  }

  // 2. Debts and what is owed to the person -------------------------------------------------------------------------
  const owed = input.debts.filter((d) => d.direction === 'owed' && d.amountCents > 0)
  const owe = input.debts.filter((d) => d.direction === 'owe' && d.amountCents > 0)
  if (owed.length > 0) {
    const who = new Set(owed.map((d) => d.otherName)).size
    add({
      id: 'cobros',
      signature: owed.map((d) => `${d.key}:${d.amountCents}`).join(','),
      label: 'Cobros',
      bubble: String(who),
      tone: 'green',
      priority: 2,
      slides: [
        {
          title: 'Te deben plata',
          figure: formatArs(sum(owed)),
          body: `${people(who)} te ${who === 1 ? 'debe' : 'deben'} plata entre tus grupos.`,
          lines: debtLines(owed),
          action: { label: 'Ver quién me debe', to: input.debtsPath },
        },
      ],
    })
  }
  if (owe.length > 0) {
    const first = owe.slice().sort((a, b) => b.amountCents - a.amountCents)[0]
    add({
      id: 'deudas',
      signature: owe.map((d) => `${d.key}:${d.amountCents}`).join(','),
      label: 'Debés',
      bubble: `$${formatCompact(sum(owe))}`,
      tone: 'blush',
      priority: 2,
      slides: [
        {
          title: 'Tenés pagos pendientes',
          figure: formatArs(sum(owe)),
          body:
            owe.length === 1 && first
              ? `Le debés a ${first.otherName} en ${first.groupName}.`
              : `Le debés a ${people(new Set(owe.map((d) => d.otherName)).size)} entre tus grupos.`,
          lines: debtLines(owe),
          action: {
            label: 'Registrar un pago',
            to: owe.length === 1 && first ? `/grupos/${first.groupId}` : input.debtsPath,
          },
        },
      ],
    })
  }

  // 3. Goals and limits ---------------------------------------------------------------------------------------------
  const { plan, reservedCents, targetCents, count } = input.goals
  if (count > 0 && targetCents > 0) {
    const share = Math.min(1, reservedCents / targetCents)
    const pct = Math.round(share * 100)
    const focus = plan?.focus ?? plan?.goals.find((g) => g.state !== 'done')
    const to = focus ? `/metas/${focus.goal.id}` : '/metas'
    const slides: StorySlide[] = []
    if (
      plan &&
      plan.missingCents > 0 &&
      (plan.status === 'attention' || plan.status === 'behind' || plan.status === 'pending')
    ) {
      slides.push({
        title: 'Metas',
        figure: formatArs(plan.missingCents),
        body: focus
          ? `Este mes te faltan ${formatArs(plan.missingCents)} para seguir al día con tus metas, empezando por ${focus.goal.name}.`
          : `Este mes te faltan ${formatArs(plan.missingCents)} para seguir al día con tus metas.`,
        action: { label: focus ? 'Ver mi meta' : 'Ver mis metas', to },
      })
    } else if (plan?.status === 'on_track') {
      slides.push({
        title: 'Metas',
        figure: `${pct}%`,
        body: 'Estás al día con tu plan de ahorro de este mes. ¡Seguí así!',
        action: { label: 'Ver mis metas', to: '/metas' },
      })
    }
    if (share >= NEAR_DONE && share < 1) {
      slides.push({
        title: 'Casi llegás',
        figure: formatArs(targetCents - reservedCents),
        body: `Te faltan ${formatArs(targetCents - reservedCents)} para completar lo que juntás para tus metas.`,
        action: { label: 'Ver mis metas', to: '/metas' },
      })
    }
    if (slides.length === 0 && focus) {
      const g = focus.goal
      slides.push({
        title: g.name,
        figure: `${pct}%`,
        body: `Llevás ${formatArs(reservedCents)} de ${formatArs(targetCents)} entre tus metas.`,
        action: { label: 'Ver mi meta', to },
      })
    }
    if (slides.length > 0) {
      add({
        id: 'metas',
        signature: `${reservedCents}:${targetCents}:${plan?.missingCents ?? 0}`,
        label: 'Metas',
        bubble: `${pct}%`,
        tone: 'blue',
        priority: 3,
        slides,
      })
    }
  }

  const alerts = input.budgets.filter((b) => b.state !== 'ok').sort((a, b) => b.percent - a.percent)
  const worst = alerts[0]
  if (worst) {
    add({
      id: 'limites',
      signature: alerts.map((b) => `${b.budgetId}:${b.state}:${Math.floor(b.percent)}`).join(','),
      label: 'Límites',
      bubble: `${Math.floor(worst.percent)}%`,
      tone: 'blush',
      priority: 3,
      slides: [
        {
          title: worst.state === 'over' ? 'Te pasaste de un límite' : 'Cerca de un límite',
          figure: formatArs(Math.abs(worst.remainingCents)),
          body:
            worst.state === 'over'
              ? `Te pasaste ${formatArs(-worst.remainingCents)} en ${worst.name}.`
              : `En ${worst.name} llevás el ${Math.floor(worst.percent)}% y te quedan ${formatArs(worst.remainingCents)}.`,
          lines:
            alerts.length > 1
              ? alerts
                  .slice(1, 1 + MAX_LINES)
                  .map((b) =>
                    b.state === 'over'
                      ? `${b.name} · pasaste ${formatArs(-b.remainingCents)}`
                      : `${b.name} · ${Math.floor(b.percent)}% · quedan ${formatArs(b.remainingCents)}`,
                  )
              : undefined,
          action: { label: 'Ver límites', to: '/categorias' },
        },
      ],
    })
  }

  const healthy = input.budgets
    .filter((b) => b.state === 'ok')
    .sort((a, b) => b.percent - a.percent)
  const closest = healthy[0]
  if (!worst && closest && closest.percent > 0) {
    add({
      id: 'limites',
      signature: healthy.map((b) => `${b.budgetId}:${Math.floor(b.percent / 10)}`).join(','),
      label: 'Límites',
      bubble: `${Math.floor(closest.percent)}%`,
      tone: 'green',
      priority: 3,
      slides: [
        {
          title: 'Tus límites van bien',
          figure: `${Math.floor(closest.percent)}%`,
          body: `El que más usaste es ${closest.name}: llevás el ${Math.floor(closest.percent)}% y te quedan ${formatArs(closest.remainingCents)}.`,
          lines: healthy
            .slice(1, 1 + MAX_LINES)
            .map(
              (b) =>
                `${b.name} · ${Math.floor(b.percent)}% · quedan ${formatArs(b.remainingCents)}`,
            ),
          action: { label: 'Ver límites', to: '/categorias' },
        },
      ],
    })
  }

  // 4. Spending -----------------------------------------------------------------------------------------------------
  const top = input.spending.byCategory
    .filter((c) => c.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents)[0]
  if (top && input.spending.expenseCents > 0) {
    const slides: StorySlide[] = [
      {
        title: `Tus gastos de ${input.monthName}`,
        figure: `${Math.round(top.percent)}%`,
        body: `El ${Math.round(top.percent)}% de tus gastos de ${input.monthName} corresponde a ${top.name} (${formatArs(top.amountCents)}).`,
        lines: input.spending.byCategory
          .filter((c) => c.amountCents > 0 && c !== top)
          .sort((a, b) => b.amountCents - a.amountCents)
          .slice(0, 2)
          .map((c) => `${c.name} · ${Math.round(c.percent)}% · ${formatArs(c.amountCents)}`),
        action: { label: 'Ver mis gastos', to: '/actividad' },
      },
    ]
    const days = input.spending.daysCounted
    if (days && days > 0) {
      slides.push({
        title: 'Tu gasto por día',
        figure: formatArs(Math.round(input.spending.expenseCents / days)),
        body: `En ${days === 1 ? 'el primer día' : `${days} días`} de ${input.monthName} gastaste ${formatArs(input.spending.expenseCents)}: es lo que sale por día, en promedio.`,
        action: { label: 'Ver el calendario', to: '/actividad' },
      })
    }
    const previous = input.spending.previousExpenseCents
    if (previous !== null && previous > 0) {
      const change = Math.round(((input.spending.expenseCents - previous) / previous) * 100)
      slides.push({
        title: `Comparado con ${input.spending.previousMonthName}`,
        figure: `${change > 0 ? '+' : ''}${change}%`,
        body:
          change === 0
            ? `Gastaste lo mismo que en ${input.spending.previousMonthName}.`
            : `Gastaste ${Math.abs(change)}% ${change > 0 ? 'más' : 'menos'} que en ${input.spending.previousMonthName}: ${formatArs(input.spending.expenseCents)} contra ${formatArs(previous)}.`,
        action: { label: 'Ver el informe', to: '/este-mes' },
      })
    }
    add({
      id: 'gastos',
      signature: `${top.name}:${input.spending.expenseCents}`,
      label: 'Gastos',
      bubble: `${Math.round(top.percent)}%`,
      tone: 'blue',
      priority: 4,
      slides,
    })
  }

  // 5. Achievements -------------------------------------------------------------------------------------------------
  const recent = input.badges.filter((b) => b.earnedOn >= addDays(input.today, -BADGE_DAYS))
  const latest = recent[recent.length - 1]
  if (latest) {
    add({
      id: 'logros',
      signature: recent.map((b) => b.key).join(','),
      label: 'Logros',
      bubble: '★',
      tone: 'gold',
      priority: 5,
      slides: [
        {
          title: 'Conseguiste una insignia',
          figure: latest.name,
          body:
            recent.length === 1
              ? `Desbloqueaste «${latest.name}». Gracias a tu constancia.`
              : `Desbloqueaste ${recent.length} insignias en los últimos días, la última «${latest.name}».`,
          action: { label: 'Ver mis logros', to: '/logros' },
        },
      ],
    })
  }

  return stories.sort((a, b) => a.priority - b.priority)
}
