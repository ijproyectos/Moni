import { ChevronLeft, Ellipsis, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GroupKind } from '@/shared/lib/database.types'
import { cn } from '@/shared/ui/cn'
import { GroupKindTile } from './GroupKindIcon'

/**
 * Header of a group or trip: back on the left, invite and options on the right. With a photo, a small rounded square
 * sits next to the name (same tile as the groups list) and the buttons get a little smaller so the name keeps its
 * room on narrow phones; without one the header is exactly the original.
 */
export function GroupDetailHeader({
  name,
  kind,
  photoUrl,
  extra,
  onBack,
  onInvite,
  onOptions,
}: {
  name: string
  kind: GroupKind
  photoUrl: string | null
  /** Shown after the name when there is no photo (the couple's avatars). */
  extra?: ReactNode
  onBack: () => void
  onInvite: () => void
  onOptions: () => void
}) {
  const compact = Boolean(photoUrl)
  const round = cn(
    'flex shrink-0 items-center justify-center rounded-full bg-card shadow-sm',
    compact ? 'size-11' : 'size-12',
  )
  return (
    <div className={cn('flex items-center', compact ? 'gap-2' : 'gap-3')}>
      <button type="button" onClick={onBack} aria-label="Volver" className={round}>
        <ChevronLeft aria-hidden="true" className="size-6" />
      </button>
      {photoUrl && (
        <GroupKindTile kind={kind} photoUrl={photoUrl} className="size-11 rounded-[12px]" />
      )}
      <h1
        className={cn(
          'min-w-0 font-display font-extrabold',
          compact
            ? 'line-clamp-2 break-words text-[24px] leading-7'
            : 'truncate text-[28px] leading-8',
        )}
      >
        {name}
      </h1>
      {!photoUrl && extra}
      <button
        type="button"
        aria-label="Invitar"
        onClick={onInvite}
        className={cn(round, 'ml-auto')}
      >
        <UserPlus aria-hidden="true" className="size-6" />
      </button>
      <button type="button" aria-label="Opciones del grupo" onClick={onOptions} className={round}>
        <Ellipsis aria-hidden="true" className="size-6" />
      </button>
    </div>
  )
}
