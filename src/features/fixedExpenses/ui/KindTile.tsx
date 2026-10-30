import { Repeat } from 'lucide-react'
import { cn } from '@/shared/ui/cn'
import { findKind } from '../domain/catalog'

const SIZES = {
  sm: 'size-10 rounded-[12px] p-2',
  md: 'size-12 rounded-[14px] p-2.5',
  lg: 'size-16 rounded-[18px] p-3.5',
} as const

/** Representative icon of a kind of fixed expense (no company logos in this version). */
export function KindTile({
  kindId,
  size = 'md',
  className,
}: {
  kindId: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const Icon = findKind(kindId)?.icon ?? Repeat
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center border border-sand bg-lime/30 text-ink',
        SIZES[size],
        className,
      )}
    >
      <Icon className="size-full" strokeWidth={2} />
    </span>
  )
}
