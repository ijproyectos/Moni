import { CalendarClock, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { useGroupRecurring, useRecurringOccurrences } from '../api/useGroups'

/** The entry to the recurring expenses of a home group: how many periods wait to be registered (from Supabase). */
export function RecurringSummaryCard({ groupId }: { groupId: string }) {
  const recurring = useGroupRecurring(groupId)
  const occurrences = useRecurringOccurrences(groupId)
  const active = (recurring.data ?? []).filter((r) => r.status === 'active')
  const activeIds = new Set(active.map((r) => r.id))
  const pending = (occurrences.data ?? []).filter((o) => o.status === 'pending' && activeIds.has(o.recurringId)).length
  return (
    <Link
      to={`/grupos/${groupId}/recurrentes`}
      className="flex min-h-16 items-center gap-3 rounded-[24px] border border-line bg-card px-4 py-3"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime/35">
        <CalendarClock aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-extrabold">Gastos recurrentes</span>
        <span className="block text-[14px] text-text-muted">
          {pending > 0
            ? pending === 1
              ? 'Tenés un gasto recurrente para registrar'
              : `Tenés ${pending} gastos recurrentes para registrar`
            : active.length > 0
              ? `${active.length} ${active.length === 1 ? 'gasto se repite' : 'gastos se repiten'}: alquiler, servicios…`
              : 'Alquiler, expensas, luz… registralos con un toque cada mes'}
        </span>
      </span>
      {pending > 0 && <span className="rounded-full bg-tint-gold px-2.5 py-0.5 text-[13px] font-extrabold">{pending}</span>}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
    </Link>
  )
}
