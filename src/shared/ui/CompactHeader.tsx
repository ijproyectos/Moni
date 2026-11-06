import { cn } from './cn'

interface CompactHeaderProps {
  title: string
  subtitle?: string
  visible: boolean
}

/**
 * The small "Inicio · Noviembre" bar that fades in at the top when the big title has scrolled away. It is decoration
 * for orientation: it lets touches through (the content under it stays usable) and is hidden from screen readers.
 */
export function CompactHeader({ title, subtitle, visible }: CompactHeaderProps) {
  return (
    <div
      aria-hidden="true"
      data-visible={visible}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-20 mx-auto w-full max-w-[430px]',
        'border-b border-line bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md',
        'transition-[opacity,transform] duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
      )}
    >
      <p className="flex h-11 items-center justify-center gap-2 text-[17px]">
        <span className="font-display font-extrabold text-ink">{title}</span>
        {subtitle && <span className="text-text-muted">{subtitle}</span>}
      </p>
    </div>
  )
}
