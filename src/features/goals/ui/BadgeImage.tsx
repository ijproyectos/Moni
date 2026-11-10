import { Trophy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/shared/ui/cn'
import { badgeImage } from '../domain/badgeImages'

/**
 * The picture of a badge. The real image is looked up by the badge key; while a picture is missing (or fails to load)
 * a provisional round medal takes its place, so the collection never shows a broken image.
 */
export function BadgeImage({
  badgeKey,
  locked = false,
  className,
}: {
  badgeKey: string
  locked?: boolean
  className?: string
}) {
  const url = badgeImage(badgeKey)
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center rounded-full border-4 border-forest bg-lime/60 text-on-bright',
          locked && 'border-line bg-sand text-text-muted',
          className,
        )}
      >
        <Trophy className="size-1/2" />
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn('object-contain', locked && 'opacity-40 grayscale', className)}
    />
  )
}
