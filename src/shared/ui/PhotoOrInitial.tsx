import { useState } from 'react'
import { cn } from './cn'

interface PhotoOrInitialProps {
  url: string | null
  initial: string
  /** Accessible description of the photo; the initial fallback is decorative. */
  alt?: string
  /** Size and shape classes shared by the photo and the fallback. */
  className?: string
  /** Extra classes for the initial fallback only (colors, font). */
  fallbackClassName?: string
}

/** Round photo (e.g. the Google account picture) that falls back to the initial when missing or broken. */
export function PhotoOrInitial({
  url,
  initial,
  alt = '',
  className,
  fallbackClassName,
}: PhotoOrInitialProps) {
  // Remember which URL failed, so a new URL gets its own chance.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setFailedUrl(url)}
        className={cn('rounded-full object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn('flex items-center justify-center rounded-full', className, fallbackClassName)}
    >
      {initial}
    </span>
  )
}
