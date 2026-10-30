import {
  BadgePercent,
  Cloud,
  Dumbbell,
  Gamepad2,
  Repeat,
  Sparkles,
  Tv,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/shared/ui/cn'
import { findService, type ServiceCategoryId } from '../domain/catalog'
import { logoUrl } from '../domain/logos'

const GENERIC_ICONS: Record<ServiceCategoryId, LucideIcon> = {
  ai: Sparkles,
  streaming: Tv,
  storage: Cloud,
  productivity: Wrench,
  gaming: Gamepad2,
  health: Dumbbell,
  memberships: BadgePercent,
}

const SIZES = {
  sm: 'size-10 rounded-[12px] p-1.5',
  md: 'size-12 rounded-[14px] p-2',
  lg: 'size-16 rounded-[18px] p-2.5',
} as const

/**
 * Logo of a service, saved locally. A logo is requested only when the tile is on screen; without one (gyms,
 * custom subscriptions) a generic icon of the service's category appears.
 */
export function ServiceLogo({
  serviceId,
  size = 'md',
  className,
}: {
  serviceId: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const service = findService(serviceId)
  const url = logoUrl(service?.logo)
  const base = cn(
    'flex shrink-0 items-center justify-center border border-sand bg-white',
    SIZES[size],
    className,
  )
  if (url) {
    return (
      <span className={base} aria-hidden="true">
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-contain"
        />
      </span>
    )
  }
  const Icon = service ? GENERIC_ICONS[service.category] : Repeat
  return (
    <span className={cn(base, 'bg-lime/30 text-forest')} aria-hidden="true">
      <Icon className="size-full" strokeWidth={2} />
    </span>
  )
}
