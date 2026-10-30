import type { ReactNode } from 'react'
import { cn } from '@/shared/ui/cn'
import type { BankBrand } from '../domain/bankCatalog'
import type { CardArt, CardSkin } from '../domain/cardSkins'
import { BrandLogo } from './BrandLogo'

const W = 'rgba(255,255,255,'

/** Original decorative illustrations (one per identity), drawn in a 320x160 box and cropped to fit the card. */
const ART: Record<CardArt, (accent: string) => ReactNode> = {
  bubbles: (a) => (
    <>
      <circle cx="270" cy="30" r="86" fill={`${W}0.12)`} />
      <circle cx="300" cy="140" r="64" fill={a} opacity="0.28" />
      <circle cx="210" cy="150" r="34" fill={`${W}0.12)`} />
      <circle cx="40" cy="170" r="52" fill={`${W}0.08)`} />
    </>
  ),
  waves: (a) => (
    <>
      <path
        d="M-10 120 C 60 80, 120 160, 190 120 S 300 90, 340 110"
        fill="none"
        stroke={a}
        strokeOpacity="0.5"
        strokeWidth="6"
      />
      <path
        d="M-10 142 C 60 102, 120 182, 190 142 S 300 112, 340 132"
        fill="none"
        stroke={`${W}0.28)`}
        strokeWidth="4"
      />
      <path
        d="M-10 164 C 60 124, 120 204, 190 164 S 300 134, 340 154"
        fill="none"
        stroke={`${W}0.16)`}
        strokeWidth="3"
      />
    </>
  ),
  flame: (a) => (
    <>
      <path
        d="M262 8 C 232 50 292 66 274 112 C 266 132 240 142 214 134 C 250 126 252 96 236 76 C 222 58 238 30 262 8 Z"
        fill={a}
        opacity="0.38"
      />
      <path
        d="M300 60 C 280 90 310 100 300 130 C 296 144 280 152 264 150 C 288 142 288 122 280 108 C 272 94 284 78 300 60 Z"
        fill={`${W}0.2)`}
      />
      <circle cx="40" cy="170" r="60" fill={`${W}0.08)`} />
    </>
  ),
  sunrise: (a) => (
    <>
      <path
        d="M-10 160 L-10 128 C 70 98 150 150 240 116 S 320 112 340 120 L340 160 Z"
        fill={a}
        opacity="0.95"
      />
      <path
        d="M-10 160 L-10 144 C 80 118 160 164 250 136 S 320 134 340 138 L340 160 Z"
        fill={`${W}0.28)`}
      />
      <circle cx="268" cy="34" r="46" fill={`${W}0.14)`} />
    </>
  ),
  orbit: (a) => (
    <>
      <circle cx="268" cy="64" r="74" fill="none" stroke={`${W}0.22)`} strokeWidth="3" />
      <circle cx="268" cy="64" r="46" fill="none" stroke={`${W}0.16)`} strokeWidth="3" />
      <circle cx="224" cy="36" r="14" fill={a} />
      <circle cx="40" cy="168" r="58" fill={`${W}0.08)`} />
    </>
  ),
  rings: (a) => (
    <>
      <circle cx="290" cy="20" r="96" fill="none" stroke={`${W}0.14)`} strokeWidth="14" />
      <circle cx="290" cy="20" r="62" fill="none" stroke={a} strokeOpacity="0.3" strokeWidth="10" />
      <circle cx="290" cy="20" r="30" fill="none" stroke={`${W}0.16)`} strokeWidth="8" />
    </>
  ),
  cross: (a) => (
    <>
      <path
        d="M215 -10 L330 105 M330 -10 L215 105"
        stroke={`${W}0.2)`}
        strokeWidth="26"
        strokeLinecap="round"
      />
      <path
        d="M255 60 L330 135 M330 60 L255 135"
        stroke={a}
        strokeOpacity="0.4"
        strokeWidth="14"
        strokeLinecap="round"
      />
    </>
  ),
  lemon: (a) => (
    <>
      <circle cx="270" cy="52" r="82" fill={a} opacity="0.55" />
      <circle cx="270" cy="52" r="66" fill="none" stroke="rgba(6,40,31,0.18)" strokeWidth="3" />
      <g stroke="rgba(6,40,31,0.16)" strokeWidth="3">
        <path d="M270 52 V-14 M270 52 L327 19 M270 52 L327 85 M270 52 V118 M270 52 L213 85 M270 52 L213 19" />
      </g>
    </>
  ),
  lattice: (a) => (
    <>
      <defs>
        <pattern
          id="lattice"
          width="36"
          height="36"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <path d="M0 0 H36 M0 0 V36" stroke={`${W}0.16)`} strokeWidth="2" fill="none" />
        </pattern>
      </defs>
      <rect x="140" y="-20" width="200" height="200" fill="url(#lattice)" />
      <circle cx="300" cy="140" r="34" fill={a} opacity="0.3" />
    </>
  ),
  chevrons: (a) => (
    <>
      <path
        d="M200 -10 L260 60 L200 130 M236 -10 L296 60 L236 130"
        fill="none"
        stroke={`${W}0.2)`}
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <path
        d="M272 -10 L332 60 L272 130"
        fill="none"
        stroke={a}
        strokeWidth="12"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </>
  ),
  hexagons: (a) => (
    <>
      <path
        d="M268 -6 L316 22 V78 L268 106 L220 78 V22 Z"
        fill="none"
        stroke={`${W}0.28)`}
        strokeWidth="5"
      />
      <path
        d="M312 70 L344 88 V124 L312 142 L280 124 V88 Z"
        fill="none"
        stroke={a}
        strokeOpacity="0.5"
        strokeWidth="4"
      />
      <path d="M-10 150 L120 150" stroke="rgba(0,0,0,0.25)" strokeWidth="14" />
    </>
  ),
  arcs: (a) => (
    <>
      <path
        d="M180 170 A 120 120 0 0 1 340 40"
        fill="none"
        stroke={a}
        strokeOpacity="0.55"
        strokeWidth="14"
      />
      <path d="M220 170 A 90 90 0 0 1 340 70" fill="none" stroke={`${W}0.25)`} strokeWidth="10" />
      <path d="M262 170 A 60 60 0 0 1 340 100" fill="none" stroke={`${W}0.16)`} strokeWidth="8" />
    </>
  ),
  'id-card': (a) => (
    <g transform="rotate(-12 280 110)">
      <rect
        x="220"
        y="76"
        width="124"
        height="82"
        rx="12"
        fill="none"
        stroke={`${W}0.22)`}
        strokeWidth="4"
      />
      <circle cx="250" cy="108" r="13" fill={a} opacity="0.4" />
      <path
        d="M272 100 H324 M272 116 H316 M234 140 H324"
        stroke={`${W}0.2)`}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  ),
  stripe: (a) => (
    <>
      <path d="M-10 146 L340 100 L340 116 L-10 162 Z" fill={a} opacity="0.85" />
      <circle cx="286" cy="26" r="70" fill={`${W}0.07)`} />
    </>
  ),
  discs: (a) => (
    <>
      <circle cx="268" cy="118" r="52" fill={a} opacity="0.55" />
      <circle cx="314" cy="118" r="52" fill="#F79E1B" opacity="0.5" />
      <path
        d="M291 76 A 52 52 0 0 1 291 160 A 52 52 0 0 1 291 76 Z"
        fill="#FF5F00"
        opacity="0.55"
      />
    </>
  ),
  lines: (a) => (
    <>
      <path
        d="M-10 40 L340 -10 M-10 70 L340 20 M-10 100 L340 50 M-10 130 L340 80"
        stroke={a}
        strokeOpacity="0.28"
        strokeWidth="3"
      />
    </>
  ),
}

/** The illustration layer of a branded card. It fills the card, sits behind its text and is ignored by screen readers. */
export function BrandCardArt({ skin, className }: { skin: CardSkin; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMaxYMid slice"
      data-art={skin.art}
      className={cn('pointer-events-none absolute inset-0 size-full', className)}
    >
      {ART[skin.art](skin.accent)}
    </svg>
  )
}

function Glyph({ kind }: { kind: 'flame' | 'lemon' | 'ring' | 'x' }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6">
      {kind === 'flame' && (
        <path
          d="M13 2 C 9 7 15 9 13 14 C 12 16.5 9 17.5 6.5 16.5 C 10 16 10.5 12.5 8.5 10 C 7 8 9.5 5 13 2 Z M16 10 C 15 13 17.5 14 16.5 17.5 C 16 19.5 13.5 21 11 20.5"
          {...common}
        />
      )}
      {kind === 'lemon' && (
        <>
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path
            d="M12 3.5 V20.5 M3.5 12 H20.5 M6 6 L18 18 M18 6 L6 18"
            {...common}
            strokeWidth={1.6}
          />
        </>
      )}
      {kind === 'ring' && (
        <>
          <circle cx="12" cy="12" r="8.5" {...common} />
          <path d="M12 5 V19" {...common} />
        </>
      )}
      {kind === 'x' && <path d="M5 5 L19 19 M19 5 L5 19" {...common} strokeWidth={3.4} />}
    </svg>
  )
}

/**
 * The emblem of a branded card: the official logo on a white chip when the project has the file (HSBC, Mercado Pago,
 * Visa, Mastercard, Amex), otherwise a monogram or glyph of the entity, in the card's own colors.
 */
export function BrandBadge({
  brand,
  skin,
  size = 'md',
  className,
}: {
  brand: BankBrand
  skin: CardSkin
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  if (brand.logo) return <BrandLogo brand={brand} className={className} />
  const box =
    size === 'lg'
      ? 'size-14 rounded-[18px]'
      : size === 'sm'
        ? 'size-8 rounded-[10px]'
        : 'size-11 rounded-[14px]'
  const text =
    skin.badge.length >= 4 ? 'text-[11px]' : skin.badge.length === 3 ? 'text-[13px]' : 'text-[16px]'
  return (
    <span
      aria-hidden="true"
      data-testid="brand-badge"
      style={{ color: skin.ink }}
      className={cn(
        'flex shrink-0 items-center justify-center bg-white/20 font-display font-extrabold leading-none ring-1 ring-white/30',
        box,
        skin.glyph === 'text' && text,
        className,
      )}
    >
      {skin.glyph === 'text' ? skin.badge : <Glyph kind={skin.glyph} />}
    </span>
  )
}
