import { MessageCircle } from 'lucide-react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { whatsappUrl } from '@/shared/lib/share'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useDebtSummary } from '../api/useDebtSummary'
import { reminderMessage, type PersonDebt } from '../domain/debtSummary'

export type DebtsSide = 'owe' | 'owed'

interface DebtsSummarySheetProps {
  side: DebtsSide
  groups: readonly { id: string; name: string }[]
  onClose: () => void
}

function groupsLine(debt: PersonDebt): string {
  return debt.groups.map((g) => g.groupName).join(' · ')
}

/** Who owes whom, per person, for the "Debés" / "Te deben" figures of the groups list. */
export function DebtsSummarySheet({ side, groups, onClose }: DebtsSummarySheetProps) {
  const { summary, isLoading, isError } = useDebtSummary(groups, true)
  const owed = side === 'owed'
  const rows = owed ? summary.owed : summary.owe
  const total = owed ? summary.owedTotalCents : summary.oweTotalCents

  return (
    <BottomSheet title={owed ? 'Te deben' : 'Debés'} onClose={onClose}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="rounded-[20px] bg-forest px-4 py-3 text-cream">
          <p className="text-[15px] text-text-muted-on-dark">
            {owed ? 'Total a cobrar' : 'Total a pagar'}
          </p>
          <AmountDisplay
            cents={total}
            className={`block font-display text-[30px] font-extrabold ${owed ? 'text-lime' : 'text-blush'}`}
          />
        </div>
        {isLoading ? (
          <div role="status" aria-label="Cargando deudas" className="flex flex-col gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : isError && rows.length === 0 ? (
          <p role="alert" className="py-4 text-center text-expense">
            No pudimos cargar el detalle. Probá de nuevo en un momento.
          </p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <img src={mascotHappy} alt="" className="size-28" />
            <p className="text-[17px] font-extrabold">
              {owed ? 'Nadie te debe nada.' : 'No le debés nada a nadie.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((debt) => (
              <li
                key={debt.personId}
                className="flex items-center gap-3 rounded-[20px] border border-sand bg-card p-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-extrabold">
                    {owed ? `${debt.name} te debe` : `Le debés a ${debt.name}`}
                  </span>
                  <span className="block truncate text-[14px] text-text-muted">
                    {groupsLine(debt)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <AmountDisplay
                    cents={debt.totalCents}
                    className={`text-[17px] font-extrabold ${owed ? 'text-income' : 'text-expense'}`}
                  />
                  {owed && (
                    <a
                      href={whatsappUrl(reminderMessage(debt))}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Recordar a ${debt.name}`}
                      className="flex min-h-11 items-center gap-1.5 rounded-full bg-lime px-3 text-[14px] font-extrabold text-forest"
                    >
                      <MessageCircle aria-hidden="true" className="size-4" />
                      Recordar
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  )
}
