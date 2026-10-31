import { cn } from '@/shared/ui/cn'

/** The yellow "✦ PLUS" badge the Home avatar wears, for places where Moni Plus is shown inline (profile). */
export function PlusPill({ className }: { className?: string }) {
  return (
    <span
      title="Moni Plus activo"
      className={cn(
        'inline-block whitespace-nowrap rounded-full bg-gold px-3 py-1 text-[13px] font-extrabold leading-4 tracking-[0.08em] text-forest',
        className,
      )}
    >
      ✦ PLUS
    </span>
  )
}
