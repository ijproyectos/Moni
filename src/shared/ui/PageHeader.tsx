import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

interface PageHeaderProps {
  title: string
  /** Where the back button goes; without it the button goes back in history. */
  backTo?: string
  backLabel?: string
  action?: ReactNode
}

const BACK_CLASS =
  'flex size-12 shrink-0 items-center justify-center rounded-full border border-sand bg-white text-forest'

/** Header for second-level pages: back button, title, optional action. */
export function PageHeader({ title, backTo, backLabel = 'Volver', action }: PageHeaderProps) {
  const navigate = useNavigate()
  return (
    <div className="flex items-center gap-3">
      {backTo ? (
        <Link to={backTo} aria-label={backLabel} className={BACK_CLASS}>
          <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={backLabel}
          className={BACK_CLASS}
        >
          <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </button>
      )}
      <h1 className="min-w-0 flex-1 font-display text-[28px] font-extrabold leading-8">{title}</h1>
      {action}
    </div>
  )
}
