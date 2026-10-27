import { ChevronRight, KeyRound, Send } from 'lucide-react'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { HeaderAddButton } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { GROUP_KIND_LABELS, type MyGroup } from '../domain/group'
import { GroupKindTile } from './GroupKindIcon'

/** A group as listed: real data plus the overlay (name, guests, simulated balance). */
export interface ListedGroup extends MyGroup {
  peopleCount: number
}

interface GroupsScreenProps {
  groups: readonly ListedGroup[] | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onNewGroup: () => void
}

function netLabel(group: ListedGroup): { text: string; tone: 'owed' | 'owes' | 'even' } {
  if (group.myNetCents > 0)
    return { text: group.kind === 'pareja' ? 'Te debe' : 'Te deben', tone: 'owed' }
  if (group.myNetCents < 0) return { text: 'Debés', tone: 'owes' }
  return { text: group.peopleCount <= 1 ? 'Sin gastos' : 'Estás al día', tone: 'even' }
}

function subtitle(group: ListedGroup): string {
  const kind = GROUP_KIND_LABELS[group.kind]
  if (group.peopleCount <= 1) return `${kind} · Solo vos por ahora`
  if (group.kind === 'pareja' && group.peopleCount === 2) return `${kind} · Vos y tu pareja`
  return `${kind} · ${group.peopleCount} personas`
}

// Screens 016 / 017 / 112 — Grupos.
export function GroupsScreen({
  groups,
  isLoading,
  isError,
  onRetry,
  onNewGroup,
}: GroupsScreenProps) {
  const owe = (groups ?? []).reduce((s, g) => s + Math.max(0, -g.myNetCents), 0)
  const owed = (groups ?? []).reduce((s, g) => s + Math.max(0, g.myNetCents), 0)

  return (
    <section className="flex flex-col gap-3 px-4 pt-14">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="font-display text-[34px] font-extrabold leading-[40px]">Grupos</h1>
        <HeaderAddButton label="Nuevo grupo" onClick={onNewGroup} />
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
          <div className="rounded-[28px] border border-sand bg-white">
            <EmptyState
              mascotUrl={mascotGroup}
              title="Todavía no tenés grupos"
              description="Armá uno para dividir los gastos de la casa, un viaje o lo que sea. Solo tu parte cuenta como gasto tuyo."
              action={<Button onClick={onNewGroup}>Nuevo grupo</Button>}
              className="pb-6 [&_h2]:text-[24px] [&_h2]:font-extrabold [&_img]:size-44"
            />
          </div>
          <Link
            to="/grupos/unirse"
            className="flex h-14 items-center justify-center gap-3 rounded-full border border-sand bg-white text-[17px] font-extrabold"
          >
            <KeyRound aria-hidden="true" className="size-5 -scale-x-100" strokeWidth={2} />
            Entrar a un grupo con un código
          </Link>
        </>
      ) : (
        <>
          <Link
            to="/deudas"
            aria-label="Ver deudas"
            className="flex items-center rounded-[24px] bg-forest px-4 py-3 text-cream"
          >
            <span className="flex-1">
              <span className="block text-[15px] text-text-muted-on-dark">Debés</span>
              <AmountDisplay
                cents={owe}
                className="block font-display text-[24px] font-extrabold text-blush"
              />
            </span>
            <span aria-hidden="true" className="mx-3 h-10 w-px bg-white/15" />
            <span className="flex-1">
              <span className="block text-[15px] text-text-muted-on-dark">Te deben</span>
              <AmountDisplay
                cents={owed}
                className="block font-display text-[24px] font-extrabold text-lime"
              />
            </span>
            <ChevronRight aria-hidden="true" className="size-6" />
          </Link>
          <ul className="flex flex-col gap-3">
            {groups.map((group) => {
              const net = netLabel(group)
              return (
                <li key={group.id}>
                  <Link
                    to={`/grupos/${group.id}`}
                    className="flex min-h-[92px] items-center gap-4 rounded-[24px] border border-sand bg-white p-4"
                  >
                    <GroupKindTile kind={group.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[20px] font-extrabold leading-6">
                        {group.name}
                      </span>
                      <span className="block truncate text-[15px] leading-5 text-text-muted">
                        {subtitle(group)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'max-w-[7.5rem] shrink-0 text-right text-[15px] font-extrabold leading-5',
                        net.tone === 'owed' && 'text-income',
                        net.tone === 'owes' && 'text-expense',
                        net.tone === 'even' && 'text-text-muted',
                      )}
                    >
                      {net.text}
                      {group.myNetCents !== 0 && (
                        <AmountDisplay
                          cents={Math.abs(group.myNetCents)}
                          className="block text-[16px]"
                        />
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/viajes"
              className="flex h-14 items-center justify-center gap-2 rounded-full border border-sand bg-white text-[17px] font-extrabold"
            >
              <Send aria-hidden="true" className="size-5" /> Mis viajes
            </Link>
            <Link
              to="/grupos/unirse"
              className="flex h-14 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-sand bg-white text-[16px] font-extrabold"
            >
              <KeyRound aria-hidden="true" className="size-5 shrink-0 -scale-x-100" /> Entrar con un
              código
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
