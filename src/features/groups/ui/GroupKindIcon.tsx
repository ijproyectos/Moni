import { useState } from 'react'
import type { GroupKind } from '@/shared/lib/database.types'
import { cn } from '@/shared/ui/cn'
import { GROUP_KIND_ICONS } from './groupKindIcons'

/**
 * Light-lime tile with the kind icon (group cards and the detail header). When the group has a photo it takes the
 * icon's place, with the same size and rounded corners; if the picture cannot be loaded the icon comes back.
 */
export function GroupKindTile({
  kind,
  photoUrl,
  className,
}: {
  kind: GroupKind
  photoUrl?: string | null
  className?: string
}) {
  const Icon = GROUP_KIND_ICONS[kind]
  // The failed address, so a new photo (another address) is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = Boolean(photoUrl) && failedUrl !== photoUrl
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-lime/40 text-ink',
        showPhoto && 'ring-1 ring-inset ring-ink/10',
        className,
      )}
    >
      {showPhoto ? (
        <img
          src={photoUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedUrl(photoUrl ?? null)}
          className="size-full object-cover"
        />
      ) : (
        <Icon className="size-6" strokeWidth={2} />
      )}
    </span>
  )
}
