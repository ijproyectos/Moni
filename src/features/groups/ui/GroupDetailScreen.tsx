import type { ReactNode } from 'react'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl, type SegmentOption } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { GROUP_KIND_LABELS, type Group } from '../domain/group'
import { describeMyBalance } from '../domain/groupView'
import { GroupKindTile } from './GroupKindIcon'

export type GroupTab = 'expenses' | 'balances' | 'members'

const TAB_OPTIONS: readonly SegmentOption<GroupTab>[] = [
  { value: 'expenses', label: 'Gastos' },
  { value: 'balances', label: 'Saldos' },
  { value: 'members', label: 'Miembros' },
]

interface GroupDetailScreenProps {
  group: Group
  /** Null while balances load or when they failed. */
  myNetCents: number | null
  tab: GroupTab
  onTabChange: (tab: GroupTab) => void
  children: ReactNode
}

/** Group detail frame: header, my balance card (dark green like Inicio) and the three tabs. */
export function GroupDetailScreen({
  group,
  myNetCents,
  tab,
  onTabChange,
  children,
}: GroupDetailScreenProps) {
  const balance = myNetCents === null ? null : describeMyBalance(myNetCents)

  return (
    <section className="flex flex-col gap-4 px-4 pt-12">
      <PageHeader title={group.name} backTo="/grupos" backLabel="Volver a Grupos" />
      <div className="-mt-2 flex items-center gap-2 px-1 text-[15px] text-text-muted">
        <GroupKindTile kind={group.kind} className="size-8 rounded-md [&_svg]:size-4" />
        {GROUP_KIND_LABELS[group.kind]}
      </div>

      <div
        className="rounded-xl bg-forest p-5 text-cream"
        aria-label="Tu saldo en el grupo"
        role="group"
      >
        {balance === null ? (
          <Skeleton className="h-16 bg-surface" />
        ) : (
          <>
            <p className="font-display text-sm font-semibold uppercase tracking-wider text-text-muted-on-dark">
              Tu saldo
            </p>
            <p className="font-display text-xl font-semibold">{balance.label}</p>
            {balance.amountCents !== null && (
              <AmountDisplay
                cents={balance.amountCents}
                className={
                  balance.tone === 'owed'
                    ? 'font-display text-[40px] font-bold leading-[48px] text-lime'
                    : 'font-display text-[40px] font-bold leading-[48px] text-blush'
                }
              />
            )}
          </>
        )}
      </div>

      <SegmentedControl
        label="Secciones del grupo"
        options={TAB_OPTIONS}
        value={tab}
        onChange={onTabChange}
      />
      {children}
    </section>
  )
}
