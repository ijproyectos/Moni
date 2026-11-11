import { Plus } from 'lucide-react'
import { useState } from 'react'
import { formatMonthYear } from '@/shared/lib/dates'
import { monthStart, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { StatusChip, type StatusChipTone } from '@/shared/ui/StatusChip'
import { useBudgetStatus } from '../api/useBudgets'
import type { BudgetState, BudgetStatus } from '../domain/budget'
import { summarizeBudgets } from '../domain/budgetSummary'
import { BudgetFormSheet } from './BudgetFormSheet'

const TONE: Record<BudgetState, StatusChipTone> = { ok: 'ok', warning: 'warn', over: 'bad' }
const LABEL: Record<BudgetState, string> = {
  ok: 'Vas bien',
  warning: 'Ajustado',
  over: 'Te pasaste',
}
const BAR: Record<BudgetState, string> = {
  ok: 'bg-mint-ink',
  warning: 'bg-[#E8B931]',
  over: 'bg-[#C4553A]',
}

function BudgetRow({ budget, onOpen }: { budget: BudgetStatus; onOpen: () => void }) {
  const Icon = getCategoryIcon(budget.icon)
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Editar presupuesto de ${budget.name}`}
        className={cn('flex w-full flex-col gap-[7px] py-2.5 text-left', FOCUS_RING)}
      >
        <span className="grid grid-cols-[34px_1fr_auto] items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-[34px] items-center justify-center rounded-full bg-sand text-ink"
          >
            <Icon className="size-[15px]" strokeWidth={1.9} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-medium">{budget.name}</span>
            <span className="block text-[12px] text-text-muted">
              <AmountDisplay cents={budget.spentCents} /> de <AmountDisplay cents={budget.amountCents} />
            </span>
          </span>
          <StatusChip tone={TONE[budget.state]} className="px-[9px] py-[3px] text-[12px]">
            {LABEL[budget.state]}
          </StatusChip>
        </span>
        <span
          role="img"
          aria-label={`${Math.floor(budget.percent)}% del límite`}
          className="block h-[7px] overflow-hidden rounded-full bg-line"
        >
          <span
            className={cn('block h-full rounded-full', BAR[budget.state])}
            style={{ width: `${Math.min(100, Math.max(0, budget.percent))}%` }}
          />
        </span>
      </button>
    </li>
  )
}

/** Presupuesto: what is left of the monthly limits, then each category with its own limit. */
export function BudgetPage() {
  const today = todayIso()
  const month = monthStart(today)
  const status = useBudgetStatus(month)
  const [sheet, setSheet] = useState<{ budget?: BudgetStatus } | null>(null)
  const budgets = status.data ?? []
  const summary = summarizeBudgets(budgets, today)
  const over = summary !== null && summary.remainingCents < 0
  const spentShare = summary && summary.limitCents > 0 ? Math.min(1, summary.spentCents / summary.limitCents) : 0
  const taken = new Set(budgets.map((b) => b.categoryId))

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader title="Presupuesto" subtitle={formatMonthYear(month)} backTo="/perfil" />

      {status.isLoading ? (
        <div role="status" aria-label="Cargando presupuesto" className="flex flex-col gap-3">
          <Skeleton className="h-40 rounded-[30px]" />
          <Skeleton className="h-64 rounded-[26px]" />
        </div>
      ) : status.isError ? (
        <div className="rounded-[26px] bg-card px-4 py-5 text-center">
          <p className="text-[15px] font-medium">No pudimos cargar tu presupuesto</p>
          <p className="mt-1 text-[13px] text-text-muted">Revisá tu conexión y probá de nuevo.</p>
          <button
            type="button"
            onClick={() => void status.refetch()}
            className={cn('mt-3 h-11 rounded-full bg-mint px-6 text-[15px] font-bold text-white', FOCUS_RING)}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {summary ? (
            <section
              aria-labelledby="budget-hero"
              className="flex flex-col gap-2 rounded-[30px] bg-mint px-[18px] py-4 text-white"
            >
              <div className="flex items-center justify-between gap-2">
                <Kicker as="h2" className="font-medium text-[#CBEBD9]">
                  <span id="budget-hero">{over ? 'Te pasaste por' : 'Te quedan'}</span>
                </Kicker>
                <StatusChip tone={TONE[summary.state]}>{LABEL[summary.state]}</StatusChip>
              </div>
              <AmountDisplay
                cents={Math.abs(summary.remainingCents)}
                className="text-[42px] font-bold leading-none tracking-[-0.04em] text-white"
              />
              <div
                role="img"
                aria-label={`Usaste el ${Math.floor(summary.percent)}% de tus límites y estás en el ${Math.round(summary.dayPosition * 100)}% del mes.`}
                className="relative h-2 rounded-full bg-white/[.16]"
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-0 rounded-full bg-[#FFE58A]"
                  style={{ width: `${spentShare * 100}%` }}
                />
                <span
                  aria-hidden="true"
                  className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 bg-white"
                  style={{ left: `${summary.dayPosition * 100}%` }}
                />
              </div>
              <div className="flex justify-between gap-3 text-[12px] text-[#CBEBD9]">
                <span>
                  Usaste <AmountDisplay cents={summary.spentCents} /> de{' '}
                  <AmountDisplay cents={summary.limitCents} />
                </span>
                <span className="whitespace-nowrap">
                  {summary.daysLeft === 0
                    ? 'Último día del mes'
                    : `${summary.daysLeft} ${summary.daysLeft === 1 ? 'día restante' : 'días restantes'}`}
                </span>
              </div>
            </section>
          ) : (
            <section className="flex flex-col gap-2 rounded-[30px] bg-mint px-[18px] py-4 text-white">
              <Kicker as="h2" className="font-medium text-[#CBEBD9]">
                Presupuesto
              </Kicker>
              <p className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em]">
                Todavía no definiste límites
              </p>
              <p className="text-[14px] text-[#DDF3E6]">
                Poné un tope mensual por categoría y Moni te muestra cuánto te queda.
              </p>
            </section>
          )}

          <div className="flex items-center justify-between">
            <h2 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
              Por categoría
            </h2>
            <button
              type="button"
              onClick={() => setSheet({})}
              className={cn('flex min-h-11 items-center gap-1 text-[13.5px] text-[#4F6157] dark:text-text-muted', FOCUS_RING)}
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              Agregar
            </button>
          </div>

          {budgets.length > 0 && (
            <ul className="rounded-[26px] bg-card px-4 py-0.5">
              {budgets.map((b) => (
                <BudgetRow key={b.budgetId} budget={b} onOpen={() => setSheet({ budget: b })} />
              ))}
            </ul>
          )}
        </>
      )}

      {sheet && (
        <BudgetFormSheet
          budget={sheet.budget}
          takenCategoryIds={taken}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  )
}
