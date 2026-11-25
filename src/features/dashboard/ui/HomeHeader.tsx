import { PlusBell } from '@/features/notifications/ui/NotificationCenter'

interface HomeHeaderProps {
  /** First name for the greeting; without it the title is just "Hola". */
  name?: string | null
}

/** Greeting row of Inicio: "Hola, [nombre]" on one line. The profile avatar (with the Plus crown) lives in the bottom bar only. */
export function HomeHeader({ name = null }: HomeHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 px-[18px] pb-1 pt-4">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="min-w-0 truncate whitespace-nowrap font-display text-[24px] font-extrabold leading-tight tracking-[-0.02em] text-[#0C2418] dark:text-[#F1EEDD]">
          {name ? `Hola, ${name}` : 'Hola'}
        </h1>
        {/* The notice center is for everybody: Free sees the notices of groups, Moni Plus also the smart ones. */}
        <PlusBell />
      </div>
    </header>
  )
}
