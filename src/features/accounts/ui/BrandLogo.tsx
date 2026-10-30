import { logoUrl } from '@/features/subscriptions/domain/logos'
import { cn } from '@/shared/ui/cn'
import type { BankBrand } from '../domain/bankCatalog'

const SIZES = {
  sm: 'size-8 rounded-[10px] p-1 text-[11px]',
  md: 'size-11 rounded-[14px] p-1.5 text-[14px]',
} as const

/** Dark text on light brand colors, light text otherwise (WCAG relative luminance). */
function readableText(hex: string): string {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  return luminance > 0.4 ? '#064735' : '#ffffff'
}

/**
 * Logo of a bank, wallet or card, saved locally. Brands whose official logo is still pending show their
 * initials on the brand color, the same way ServiceLogo falls back to a generic icon.
 */
export function BrandLogo({
  brand,
  size = 'md',
  className,
}: {
  brand: BankBrand
  size?: keyof typeof SIZES
  className?: string
}) {
  const url = logoUrl(brand.logo)
  if (url) {
    return (
      <span
        aria-hidden="true"
        className={cn('flex shrink-0 items-center justify-center bg-white', SIZES[size], className)}
      >
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
  return (
    <span
      aria-hidden="true"
      data-testid="brand-initials"
      className={cn(
        'flex shrink-0 items-center justify-center font-display font-extrabold leading-none',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: brand.brandColor, color: readableText(brand.brandColor) }}
    >
      {brand.initials}
    </span>
  )
}
