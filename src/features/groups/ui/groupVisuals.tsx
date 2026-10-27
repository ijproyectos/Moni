import { Avatar } from '@/shared/ui/kit'
import { cn } from '@/shared/ui/cn'
import type { Person } from '../domain/ledger'

/** Overlapping initials ("J M L F"). */
export function AvatarStack({
  people,
  size = 'sm',
  className,
}: {
  people: readonly Pick<Person, 'name'>[]
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <span className={cn('flex -space-x-2', className)} aria-hidden="true">
      {people.map((p, i) => (
        <Avatar key={`${p.name}-${i}`} name={p.name} size={size} className="ring-2 ring-white/0" />
      ))}
    </span>
  )
}
