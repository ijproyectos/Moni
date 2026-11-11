import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { MENTA_CIRCLE } from './mentaStyles'

interface MentaHeaderProps {
  title: string
  subtitle?: string
  /** Back target; without it the back button goes to the previous screen. `null` hides the button. */
  backTo?: string | null
  /** Right circle (usually a `MENTA_CIRCLE` button); empty keeps the title centered. */
  action?: ReactNode
}

/** Header of the Menta design: back circle, centered title with a small line under it, optional action circle. */
export function MentaHeader({ title, subtitle, backTo, action }: MentaHeaderProps) {
  const navigate = useNavigate()
  const chevron = <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
  return (
    <header className="grid grid-cols-[44px_1fr_44px] items-center">
      {backTo === null ? (
        <span aria-hidden="true" />
      ) : backTo ? (
        <Link to={backTo} aria-label="Volver" className={MENTA_CIRCLE}>
          {chevron}
        </Link>
      ) : (
        <button type="button" onClick={() => navigate(-1)} aria-label="Volver" className={MENTA_CIRCLE}>
          {chevron}
        </button>
      )}
      <div className="min-w-0 text-center">
        <h1 className="truncate font-display text-[20px] font-semibold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && <p className="text-[12.5px] text-text-muted">{subtitle}</p>}
      </div>
      {action ?? <span aria-hidden="true" />}
    </header>
  )
}
