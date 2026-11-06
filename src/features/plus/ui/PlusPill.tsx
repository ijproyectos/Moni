import { cn } from '@/shared/ui/cn'

/** The yellow "✦ PLUS" badge the Home avatar wears, for places where Moni Plus is shown inline (profile). */
export function PlusPill({ className }: { className?: string }) {
  return (
    <span
      title="Moni Plus activo"
      className={cn(
        'inline-flex h-7 items-center justify-center whitespace-nowrap rounded-full bg-gold px-3 indent-[0.08em] text-[13px] font-extrabold leading-none tracking-[0.08em] text-forest',
        className,
      )}
    >
      ✦ PLUS
    </span>
  )
}
