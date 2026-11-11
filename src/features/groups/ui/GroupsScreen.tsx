import { ChevronRight, KeyRound, Plus, UsersRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { EmptyState } from '@/shared/ui/EmptyState'
import { BigFigure } from '@/shared/ui/BigFigure'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MENTA_CIRCLE, MINT_PILL, WHITE_PILL } from '@/shared/ui/mentaStyles'
import { Skeleton } from '@/shared/ui/Skeleton'
import { GROUP_KIND_LABELS, type MyGroup } from '../domain/group'
import { balanceTotals } from '../domain/groupsOverview'
import { GROUP_KIND_ICONS } from './groupKindIcons'

/** A group as listed: real data plus the overlay (name, guests, simulated balance). */
export interface ListedGroup extends MyGroup {
  peopleCount: number
  /** Signed link to the group's photo, when it has one. */
  photoUrl?: string | null
}

interface GroupsScreenProps {
  groups: readonly ListedGroup[] | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  onNewGroup: () => void
  /** Taps on the green box: opens "Deudas de grupos" on the tab of the amount that was tapped. */
  onOpenDebts?: (tab: 'owe' | 'owed') => void
  /** Latest real expense of the most recently active group; omitted when there is none. */
  lastExpense?: LastExpenseRow | null
}

function netLabel(group: ListedGroup): { text: string; tone: 'owed' | 'owes' | 'even' } {
  if (group.myNetCents > 0)
    return { text: group.kind === 'pareja' ? 'te debe' : 'te deben', tone: 'owed' }
  if (group.myNetCents < 0) return { text: 'debés', tone: 'owes' }
  return { text: group.peopleCount <= 1 ? 'Sin gastos' : 'Al día', tone: 'even' }
}

function subtitle(group: ListedGroup): string {
  const kind = GROUP_KIND_LABELS[group.kind]
  if (group.peopleCount <= 1) return `${kind} · Solo vos por ahora`
  if (group.kind === 'pareja' && group.peopleCount === 2) return `${kind} · Vos y tu pareja`
  return `${kind} · ${group.peopleCount} personas`
}

/** Icon of a group row: round, mint for the first (couple) kind, soft mint otherwise; a photo takes its place. */
function GroupRowIcon({ group }: { group: ListedGroup }) {
  const Icon = GROUP_KIND_ICONS[group.kind]
  // The failed address, so a new photo (another address) is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const photo = group.photoUrl && failedUrl !== group.photoUrl ? group.photoUrl : null
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-[42px] shrink-0 items-center justify-center overflow-hidden rounded-full',
        group.kind === 'pareja' ? 'bg-mint text-white' : 'bg-mint-soft text-mint-ink',
        photo && 'ring-1 ring-inset ring-ink/10',
      )}
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(photo)}
          className="size-full object-cover"
        />
      ) : (
        <Icon className="size-[19px]" strokeWidth={1.9} />
      )}
    </span>
  )
}

export interface LastExpenseRow {
  groupName: string
  description: string
  /** Second line: "Pagaste vos · ayer". */
  meta: string
  /** My effect on the balance: positive they owe me, negative I owe. */
  deltaCents: number
  icon: LucideIcon
}

const PILL = `flex min-h-12 items-center gap-2.5 rounded-[18px] bg-sand p-3 text-[14px] font-medium ${FOCUS_RING}`

// Screens 015 / 028 — Grupos.
export function GroupsScreen({
  groups,
  isLoading,
  isError,
  onRetry,
  onNewGroup,
  onOpenDebts,
  lastExpense,
}: GroupsScreenProps) {
  const { owedCents: owed, oweCents: owe } = balanceTotals(groups ?? [])
  const header = (
    <MentaHeader
      backTo={null}
      title="Grupos"
      subtitle="Gastos compartidos"
      action={
        <button type="button" aria-label="Nuevo grupo" onClick={onNewGroup} className={MENTA_CIRCLE}>
          <Plus aria-hidden="true" className="size-5" strokeWidth={2.2} />
        </button>
      }
    />
  )

  return (
    <section className="flex flex-col gap-3 px-[18px] pt-1">
      {isLoading ? (
        <>
          <MentaHeader backTo={null} title="Grupos" subtitle="Gastos compartidos" />
          <div role="status" aria-label="Cargando grupos" className="flex flex-col gap-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-24" />
          </div>
        </>
      ) : isError || !groups ? (
        <>
          <MentaHeader backTo={null} title="Grupos" subtitle="Gastos compartidos" />
          <EmptyState
            className="pt-16"
            mascotUrl={mascotAlert}
            title="No pudimos cargar tus grupos"
            description="Revisá tu conexión y probá de nuevo."
            action={<Button onClick={onRetry}>Reintentar</Button>}
          />
        </>
      ) : groups.length === 0 ? (
        <>
          <MentaHeader
            backTo={null}
            title="Grupos"
            subtitle="Gastos compartidos"
            action={
              <button type="button" aria-label="Nuevo grupo" onClick={onNewGroup} className={MENTA_CIRCLE}>
                <Plus aria-hidden="true" className="size-5" strokeWidth={2.2} />
              </button>
            }
          />
          <div className="flex flex-col items-center gap-3.5 px-3 pt-10 text-center">
            <img
              src={mascotGroup}
              alt=""
              className="size-[120px] rounded-full border-[5px] border-lilac bg-card object-cover"
            />
            <h2 className="font-display text-[26px] font-bold leading-[1.1] tracking-[-0.03em]">
              Todavía no compartís gastos
            </h2>
            <p className="max-w-[280px] text-pretty text-[15px] text-text-muted">
              Armá un grupo con tu pareja, tu familia o tus amigos y yo llevo la cuenta de quién debe
              qué.
            </p>
            <div className="mt-1.5 flex w-full flex-col gap-2.5">
              <button type="button" onClick={onNewGroup} className={cn(MINT_PILL, 'h-[54px] text-[16px] font-bold')}>
                <UsersRound aria-hidden="true" className="size-5" strokeWidth={2.2} />
                Crear grupo
              </button>
              <Link to="/grupos/unirse" className={cn(WHITE_PILL, 'h-12 text-[15px] font-semibold')}>
                <ChevronRight aria-hidden="true" className="size-[18px]" />
                Entrar con un código
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          {header}
          <div className="flex flex-col gap-2.5 rounded-[30px] bg-mint px-[18px] py-4 text-white">
            <button
              type="button"
              aria-label="Ver lo que te deben"
              onClick={() => onOpenDebts?.('owed')}
              className="flex flex-col gap-2.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Kicker as="span" className="font-medium text-[#CBEBD9]">
                Te deben
              </Kicker>
              <BigFigure cents={owed} signed={owed > 0} />
            </button>
            <button
              type="button"
              aria-label="Ver lo que debés"
              onClick={() => onOpenDebts?.('owe')}
              className="flex items-center justify-between gap-2 rounded-lg border-t border-white/15 pt-2.5 text-[13.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <span className="text-[#DDF3E6]">Debés</span>
              <span className="font-medium">
                {owe > 0 ? <AmountDisplay cents={owe} /> : '$0 · sin deudas'}
              </span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={onNewGroup} className={PILL}>
              <UsersRound aria-hidden="true" className="size-[19px]" strokeWidth={1.9} />
              Crear grupo
            </button>
            <Link to="/grupos/unirse" className={PILL}>
              <KeyRound aria-hidden="true" className="size-[19px] -scale-x-100" strokeWidth={1.9} />
              Entrar con código
            </Link>
          </div>
          <ul className="divide-y divide-line rounded-[26px] bg-card px-4 py-0.5">
            {groups.map((group) => {
              const net = netLabel(group)
              return (
                <li key={group.id}>
                  <Link
                    to={`/grupos/${group.id}`}
                    className={cn('grid grid-cols-[42px_1fr_auto] items-center gap-3 py-2.5', FOCUS_RING)}
                  >
                    <GroupRowIcon group={group} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium">{group.name}</span>
                      <span className="block truncate text-[12px] text-text-muted">{subtitle(group)}</span>
                    </span>
                    {net.tone === 'owed' || net.tone === 'owes' ? (
                      <span className="text-right">
                        <AmountDisplay
                          cents={Math.abs(group.myNetCents)}
                          signed={net.tone === 'owed'}
                          className={cn(
                            'block text-[15px] font-medium',
                            net.tone === 'owed' ? 'text-income' : 'text-expense',
                          )}
                        />
                        <span className="block text-[12px] text-text-muted">{net.text}</span>
                      </span>
                    ) : (
                      <span className={cn('text-[14px] font-medium', net.tone === 'even' && group.peopleCount > 1 ? 'text-income' : 'text-text-muted')}>
                        {net.text}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
          {lastExpense && (
            <div className="flex flex-col gap-2">
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                Último en {lastExpense.groupName}
              </h2>
              <div className="rounded-[26px] bg-card px-4 py-0.5">
                <div className="grid grid-cols-[38px_1fr_auto] items-center gap-3 py-2">
                  <span
                    aria-hidden="true"
                    className="flex size-[38px] items-center justify-center rounded-full bg-sand text-ink"
                  >
                    <lastExpense.icon className="size-[17px]" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium">{lastExpense.description}</p>
                    <p className="text-[12px] text-text-muted">{lastExpense.meta}</p>
                  </div>
                  {lastExpense.deltaCents !== 0 && (
                    <AmountDisplay
                      cents={lastExpense.deltaCents}
                      signed
                      className={cn(
                        'whitespace-nowrap text-[15px] font-medium',
                        lastExpense.deltaCents > 0 ? 'text-income' : 'text-expense',
                      )}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
