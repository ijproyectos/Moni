import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'

export const ROW_GRID = 'grid grid-cols-[34px_1fr_auto_16px] items-center gap-3 py-2'
const ROW_FOCUS =
  'rounded-xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mint-ink'

export function RowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-chip text-ink"
    >
      <Icon className="size-4" strokeWidth={2} />
    </span>
  )
}

/**
 * A row of the Menta white card: icon, label, current value and a chevron. The real control (a native select or date
 * input) lies invisible over the whole row, so the native picker opens on tap and the keyboard keeps working.
 */
export function PickerRow({
  icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon
  label: string
  value: string
  children: ReactNode
}) {
  return (
    <label className={cn('relative', ROW_GRID, ROW_FOCUS)}>
      <RowIcon icon={icon} />
      <span className="text-[14.5px] font-medium">{label}</span>
      <span className="max-w-[40vw] truncate text-[14px] text-text-muted">{value}</span>
      <ChevronRight aria-hidden="true" className="size-4 text-[#8A9A90]" strokeWidth={2} />
      {children}
    </label>
  )
}

/** Class of the invisible control that lies over a `PickerRow`. */
export const ROW_CONTROL = 'absolute inset-0 size-full cursor-pointer opacity-0 outline-none'

/** "Dividir con un grupo · No/Sí": a switch row. */
export function ShareRow({
  icon,
  checked,
  onChange,
}: {
  icon: LucideIcon
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Dividir con un grupo"
      onClick={() => onChange(!checked)}
      className={cn('w-full text-left', ROW_GRID, 'rounded-xl', FOCUS_RING)}
    >
      <RowIcon icon={icon} />
      <span className="text-[14.5px] font-medium">Dividir con un grupo</span>
      <span className="text-[14px] text-text-muted">{checked ? 'Sí' : 'No'}</span>
      <ChevronRight aria-hidden="true" className="size-4 text-[#8A9A90]" strokeWidth={2} />
    </button>
  )
}
