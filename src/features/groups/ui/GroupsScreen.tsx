import { KeyRound } from 'lucide-react'
import { Link } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotGroup from '@/assets/mascot/personaje_gastos-en-grupo.svg'
import { formatArs } from '@/shared/lib/money'
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
}

function netLabel(group: ListedGroup): { text: string; tone: 'owed' | 'owes' | 'even' } {
  if (group.myNetCents > 0)
    return { text: group.kind === 'pareja' ? 'Te debe' : 'Te deben', tone: 'owed' }
  if (group.myNetCents < 0) return { text: 'Debés', tone: 'owes' }
  return { text: group.peopleCount <= 1 ? 'Sin gastos' : 'Estás al día', tone: 'even' }
}

/** "en el grupo IJ", "entre Amores y Cena viernes", "en 4 grupos": where the amount comes from. */
function whereLabel(prefix: 'en' | 'entre', names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return prefix === 'en' ? `en el grupo ${names[0]}` : `en ${names[0]}`
  if (names.length === 2) return `entre ${names[0]} y ${names[1]}`
  return `en ${names.length} grupos`
}

function subtitle(group: ListedGroup): string {
  const kind = GROUP_KIND_LABELS[group.kind]
  if (group.peopleCount <= 1) return `${kind} · Solo vos por ahora`
  if (group.kind === 'pareja' && group.peopleCount === 2) return `${kind} · Vos y tu pareja`
  return `${kind} · ${group.peopleCount} personas`
}

/** Text size of both amounts: they shrink together with the longest one so it never leaves its card. */
function debtAmountSize(...cents: number[]): string {
  const longest = Math.max(...cents.map((c) => formatArs(c).length))
  if (longest <= 8) return 'text-[clamp(22px,6.5vw,28px)]'
  if (longest <= 10) return 'text-[clamp(17px,5vw,22px)]'
  return 'text-[clamp(15px,4.2vw,19px)]'
}

const DEBT_CARD_TONE = {
  owe: 'from-[#c85a3e] to-[#e28a5c]',
  owed: 'from-[#3a7a4a] to-[#5a9a64]',
} as const

/**
 * "Debés" / "Te deben": one component for both, so they cannot drift apart. The grid stretches them to the same height
 * (the taller one sets it) and the content always starts at the top: title, amount, then the optional line.
 */
function DebtCard({
  label,
  ariaLabel,
  cents,
  where,
  tone,
  amountSize,
  onOpen,
}: {
  label: string
  ariaLabel: string
  cents: number
  where?: string | null
  tone: keyof typeof DEBT_CARD_TONE
  /** Same on both cards, so a long amount in one shrinks the pair together. */
  amountSize: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onOpen}
      className={`flex min-h-[112px] min-w-0 flex-col justify-start rounded-[24px] bg-gradient-to-br p-4 text-left text-white ${DEBT_CARD_TONE[tone]}`}
    >
      <span className="block text-[15px] leading-5">{label}</span>
      <AmountDisplay
        cents={cents}
        className={`mt-0.5 block whitespace-nowrap font-display font-extrabold leading-tight ${amountSize}`}
      />
      {where && <span className="mt-1 block text-[13px] leading-[18px]">{where}</span>}
    </button>
  )
}

// Screens 016 / 017 / 112 — Grupos.
export function GroupsScreen({
  groups,
  isLoading,
  isError,
  onRetry,
  onNewGroup,
  onOpenDebts,
}: GroupsScreenProps) {
  const owe = (groups ?? []).reduce((s, g) => s + Math.max(0, -g.myNetCents), 0)
  const owed = (groups ?? []).reduce((s, g) => s + Math.max(0, g.myNetCents), 0)
  const amountSize = debtAmountSize(owe, owed)
  const oweWhere = whereLabel(
    'en',
    (groups ?? []).filter((g) => g.myNetCents < 0).map((g) => g.name),
  )
  const owedWhere = whereLabel(
    'entre',
    (groups ?? []).filter((g) => g.myNetCents > 0).map((g) => g.name),
  )

  return (
    <section className="flex flex-col gap-4 px-5 pt-6">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-medium text-text-muted">
            {groups ? `${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'}` : '\u00a0'}
          </p>
          <h1 className="font-display text-[clamp(28px,8.5vw,32px)] font-extrabold leading-tight">
            Grupos
          </h1>
        </div>
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
          <div className="rounded-[28px] border border-line bg-card">
            <EmptyState
              mascotUrl={mascotGroup}
              title="Todavía no tenés grupos"
              description="Armá uno para dividir los gastos de la casa, una salida o lo que sea. Solo tu parte cuenta como gasto tuyo."
              action={<Button onClick={onNewGroup}>Nuevo grupo</Button>}
              className="pb-6 [&_h2]:text-[24px] [&_h2]:font-extrabold [&_img]:size-44"
            />
          </div>
          <Link
            to="/grupos/unirse"
            className="flex h-14 items-center justify-center gap-3 rounded-full border border-line bg-card text-[17px] font-extrabold"
          >
            <KeyRound aria-hidden="true" className="size-5 -scale-x-100" strokeWidth={2} />
            Entrar a un grupo con un código
          </Link>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 items-stretch gap-3">
            <DebtCard
              label="Debés"
              ariaLabel="Ver lo que debés"
              cents={owe}
              where={oweWhere}
              tone="owe"
              amountSize={amountSize}
              onOpen={() => onOpenDebts?.('owe')}
            />
            <DebtCard
              label="Te deben"
              ariaLabel="Ver lo que te deben"
              cents={owed}
              where={owedWhere}
              tone="owed"
              amountSize={amountSize}
              onOpen={() => onOpenDebts?.('owed')}
            />
          </div>
          <h2 className="mt-2 font-display text-[22px] font-extrabold">Tus grupos</h2>
          <ul className="-mx-5 divide-y divide-line border-y border-line">
            {groups.map((group) => {
              const net = netLabel(group)
              return (
                <li key={group.id}>
                  <Link
                    to={`/grupos/${group.id}`}
                    className="flex min-h-[84px] items-center gap-4 px-5 py-3"
                  >
                    <GroupKindTile
                      kind={group.kind}
                      photoUrl={group.photoUrl}
                      className="rounded-full"
                    />
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
                        net.tone === 'even' && 'font-semibold text-text-muted',
                      )}
                    >
                      {net.text}
                      {group.myNetCents !== 0 && (
                        <AmountDisplay
                          cents={Math.abs(group.myNetCents)}
                          className="block text-[18px]"
                        />
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <Link
            to="/grupos/unirse"
            className="flex h-14 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-card text-[16px] font-extrabold"
          >
            <KeyRound aria-hidden="true" className="size-5 shrink-0 -scale-x-100" /> Entrar con un
            código
          </Link>
        </>
      )}
    </section>
  )
}
