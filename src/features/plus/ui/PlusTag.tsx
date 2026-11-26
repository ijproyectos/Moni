import { cn } from '@/shared/ui/cn'
import { usePlus } from '../api/usePlus'

/**
 * The small "PLUS" label of a Moni Plus capability: soft gold in light mode, a warm dark gold in dark mode, tiny and quiet (no lock, no
 * crown, nothing darkened). It is only a label: whoever shows it decides what tapping does (open the promo).
 */
export function PlusTagMark({ className }: { className?: string }) {
  return (
    <span
      data-plus-tag
      className={cn(
        'inline-flex h-[16px] shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#E3B23C]/60 bg-[#F8EDC4] px-[6px] indent-[0.06em] text-[9.5px] font-extrabold leading-none tracking-[0.08em] text-[#6B4E00] dark:border-[#E3B23C]/40 dark:bg-[#3A2F10] dark:text-[#F0D58A]',
        className,
      )}
    >
      PLUS
    </span>
  )
}

/** The label, only for people on the Free plan (Moni Plus people never see promotional labels). */
export function PlusTag({ className }: { className?: string }) {
  const { isFree } = usePlus()
  if (!isFree) return null
  return <PlusTagMark className={className} />
}
