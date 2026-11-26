import { cn } from '@/shared/ui/cn'

/** Small pill marking a recurring payment small enough to be a "gasto hormiga" — the kind people forget they pay. */
export function AntBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block shrink-0 rounded-full bg-gold/45 px-2 py-0.5 text-[11px] font-extrabold text-ink',
        className,
      )}
    >
      Hormiga
    </span>
  )
}
