import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

interface PageHeaderProps {
  title: string
  backTo: string
  backLabel?: string
  action?: ReactNode
}

/** Header for second-level pages (Cuentas, Categorías, Perfil): back link, title, optional action. */
export function PageHeader({ title, backTo, backLabel = 'Volver', action }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <Link
        to={backTo}
        aria-label={backLabel}
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sand text-forest"
      >
        <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={2} />
      </Link>
      <h1 className="flex-1 font-display text-[28px] font-bold leading-8">{title}</h1>
      {action}
    </div>
  )
}
