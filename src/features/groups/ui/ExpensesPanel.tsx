import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import type { CategoryTemplate } from '@/features/categories/domain/category'
import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { CategoryIconCircle } from '@/shared/ui/IconCircle'
import { MovementRow } from '@/shared/ui/MovementRow'
import type { GroupMember, SharedExpense } from '../domain/group'
import { myShareCents, nameById } from '../domain/groupView'

interface ExpensesPanelProps {
  expenses: readonly SharedExpense[]
  members: readonly GroupMember[]
  templates: readonly CategoryTemplate[]
  meId: string
  onOpen: (expense: SharedExpense) => void
  onNew: () => void
}

/** "Gastos" tab: shared expenses newest first with the person's own share. */
export function ExpensesPanel({
  expenses,
  members,
  templates,
  meId,
  onOpen,
  onNew,
}: ExpensesPanelProps) {
  const today = todayIso()

  if (expenses.length === 0) {
    return (
      <Card className="rounded-[28px] p-0">
        <EmptyState
          mascotUrl={mascotGroup}
          title="Todavía no hay gastos"
          description="Cargá el primer gasto compartido y Moni calcula cuánto le toca a cada uno."
          action={<Button onClick={onNew}>Nuevo gasto compartido</Button>}
          className="pb-6"
        />
      </Card>
    )
  }

  return (
    <Card className="py-1">
      <ul className="divide-y divide-cream">
        {expenses.map((expense) => {
          const template = templates.find((t) => t.slug === expense.templateSlug)
          const voided = expense.status === 'voided'
          const share = myShareCents(expense, meId)
          const payer = nameById(members, expense.paidBy, meId)
          return (
            <li key={expense.id}>
              <MovementRow
                leading={<CategoryIconCircle iconName={template?.icon} color={template?.color} />}
                title={expense.description}
                subtitle={`${voided ? 'Anulado · ' : ''}Pagó ${payer} · ${formatRelativeDay(expense.occurredOn, today)}`}
                pressLabel={`Ver gasto ${expense.description}`}
                onPress={() => onOpen(expense)}
                trailing={
                  <span
                    className={cn('flex flex-col items-end', voided && 'line-through opacity-60')}
                  >
                    <AmountDisplay cents={expense.amountCents} />
                    <span className="text-sm font-normal text-text-muted">
                      {share > 0 ? (
                        <>
                          tu parte <AmountDisplay cents={share} />
                        </>
                      ) : (
                        'no participás'
                      )}
                    </span>
                  </span>
                }
              />
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
