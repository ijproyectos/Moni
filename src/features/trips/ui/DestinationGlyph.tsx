import { cn } from '@/shared/ui/cn'
import { destinationTheme, type DestinationTheme } from '../domain/destinationIcon'

const EMOJI: Record<Exclude<DestinationTheme, 'eiffel'>, string> = {
  beach: '🏖️',
  palm: '🌴',
  sea: '🌊',
  sun: '☀️',
  mountain: '⛰️',
  snow: '🏔️',
  city: '🏙️',
  landmark: '🏛️',
  plane: '✈️',
}

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

/** The Eiffel Tower, drawn in the same soft flat colors as the rest (there is no emoji for it). */
function Eiffel() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.1em]">
      <path d="M12 2 13 6h-2zM10.6 6h2.8l1.1 7H9.5zM9.3 14.5h5.4l1.6 7.5h-2.3l-.7-3.2h-3.6l-.7 3.2H7.7z" fill="#8A6F5A" />
      <path d="M8.4 14h7.2v1.3H8.4zM10 6h4v1.2h-4z" fill="#B9A08A" />
      <path d="M10.4 18.8h3.2c0-1.6-.7-3-1.6-3.8-.9.8-1.6 2.2-1.6 3.8z" fill="#E8DCCB" />
    </svg>
  )
}

/** Round badge with the look of a trip's destination: the picture for what the name says, or a plane when it says nothing known. */
export function DestinationGlyph({
  name,
  className,
  size = 24,
}: {
  name: string
  className?: string
  /** Size of the picture in px. */
  size?: number
}) {
  const theme = destinationTheme(name)
  return (
    <span
      aria-hidden="true"
      data-destination={theme}
      className={cn('inline-flex items-center justify-center leading-none', className)}
      style={{ fontSize: size, fontFamily: EMOJI_FONT }}
    >
      {theme === 'eiffel' ? <Eiffel /> : EMOJI[theme]}
    </span>
  )
}
