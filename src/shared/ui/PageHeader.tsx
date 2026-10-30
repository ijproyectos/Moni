import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useGoBack } from '@/shared/lib/useGoBack'

interface PageHeaderProps {
  title: string
  /** Where the back button always goes; without it (or `fallbackTo`) the button goes back in history. */
  backTo?: string
  /** Back goes to the screen the person came from; only when there is none (page opened directly) it goes here. */
  fallbackTo?: string
  backLabel?: string
  action?: ReactNode
}

const BACK_CLASS =
  'flex size-12 shrink-0 items-center justify-center rounded-full border border-sand bg-card text-ink'

/** Header for second-level pages: back button, title, optional action. */
export function PageHeader({
  title,
  backTo,
  fallbackTo,
  backLabel = 'Volver',
  action,
}: PageHeaderProps) {
  const navigate = useNavigate()
  const goBack = useGoBack(fallbackTo ?? '/')
  return (
    <div className="flex items-center gap-3">
      {backTo && !fallbackTo ? (
        <Link to={backTo} aria-label={backLabel} className={BACK_CLASS}>
          <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={fallbackTo ? goBack : () => navigate(-1)}
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
