import { cn } from './cn'

/** Placeholder block while data loads. Decorative; parents announce loading with role="status". */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-sand', className)} />
}
