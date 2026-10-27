import { KeyRound, Plus } from 'lucide-react'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { GROUP_KIND_LABELS, type MyGroup } from '../domain/group'
import { describeGroupNet, groupSubtitle } from '../domain/groupView'
import { GroupKindTile } from './GroupKindIcon'

interface GroupsScreenProps {
  groups: readonly MyGroup[] | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onNewGroup: () => void
  onJoinWithCode: () => void
}

function JoinButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-full border border-cream bg-white font-display text-[17px] font-semibold text-forest"
    >
      <KeyRound aria-hidden="true" className="size-5" strokeWidth={2} />
      Entrar a un grupo con un código
    </button>
  )
}

/** Grupos tab (screens 10 and 11). Presentational: the page owns data and sheets. */
export function GroupsScreen({
  groups,
  isLoading,
  isError,
  onRetry,
  onNewGroup,
  onJoinWithCode,
}: GroupsScreenProps) {
  return (
    <section className="flex flex-col gap-3 px-4 pt-12">
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <h1 className="font-display text-[30px] font-bold leading-[34px]">Grupos</h1>
        <button
          type="button"
          onClick={onNewGroup}
          aria-label="Nuevo grupo"
          className="flex size-12 items-center justify-center rounded-full bg-lime text-forest"
        >
          <Plus aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </button>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Cargando grupos" className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : isError || !groups ? (
        <EmptyState
          className="pt-16"
          mascotUrl={mascotAlert}
          title="No pudimos cargar tus grupos"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={onRetry}>Reintentar</Button>}
        />
      ) : groups.length === 0 ? (
        <>
          <Card className="rounded-[28px] p-0">
            <EmptyState
              mascotUrl={mascotGroup}
              title="Todavía no tenés grupos"
              description="Armá uno para dividir los gastos de la casa, un viaje o lo que sea. Solo tu parte cuenta como gasto tuyo."
              action={<Button onClick={onNewGroup}>Nuevo grupo</Button>}
              className="pb-6"
            />
          </Card>
          <JoinButton onClick={onJoinWithCode} />
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {groups.map((group) => {
              const net = describeGroupNet(group)
              return (
                <li key={group.id}>
                  <Link
                    to={`/grupos/${group.id}`}
                    className="flex min-h-24 items-center gap-4 rounded-xl border border-cream bg-white p-4"
                  >
                    <GroupKindTile kind={group.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[19px] font-bold leading-6 text-forest">
                        {group.name}
                      </span>
                      <span className="block truncate text-[15px] leading-5 text-text-muted">
                        {groupSubtitle(GROUP_KIND_LABELS[group.kind], group.memberCount)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'max-w-[7.5rem] shrink-0 text-right text-[15px] leading-5',
                        net.tone === 'owed' && 'text-income',
                        net.tone === 'owes' && 'text-expense',
                        (net.tone === 'even' || net.tone === 'empty') && 'text-text-muted',
                      )}
                    >
                      {net.label}
                      {net.amountCents !== null && (
                        <AmountDisplay
                          cents={net.amountCents}
                          className="block font-display text-[17px] font-semibold"
                        />
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <JoinButton onClick={onJoinWithCode} />
        </>
      )}
    </section>
  )
}
