import type { GroupKind } from '@/shared/lib/database.types'
import { cn } from '@/shared/ui/cn'
import { GROUP_KIND_ICONS } from './groupKindIcons'

/** Light-lime tile with the kind icon (group cards and the detail header). */
export function GroupKindTile({ kind, className }: { kind: GroupKind; className?: string }) {
  const Icon = GROUP_KIND_ICONS[kind]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-lime/40 text-ink',
        className,
      )}
    >
      <Icon className="size-6" strokeWidth={2} />
    </span>
  )
}
