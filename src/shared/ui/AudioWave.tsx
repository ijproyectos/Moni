import { cn } from './cn'

/** Bar heights (px) of the Menta voice screen. */
const HEIGHTS = [10, 18, 30, 22, 40, 28, 46, 34, 20, 38, 26, 44, 30, 16, 24, 36, 22, 12] as const

/**
 * Decorative sound wave: it only suggests that Moni is listening (it does not read the microphone). The bars sway
 * unless the person asked for reduced motion, in which case they stay still. Hidden from screen readers.
 */
export function AudioWave({ animated = true, className }: { animated?: boolean; className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="audio-wave"
      className={cn('flex h-[50px] items-center gap-1', className)}
    >
      {HEIGHTS.map((height, index) => (
        <span
          key={index}
          style={{
            height,
            animationDelay: `${(index % 6) * -140}ms`,
            animationDuration: `${900 + (index % 5) * 120}ms`,
          }}
          className={cn(
            'w-[5px] rounded-full bg-mint',
            animated && 'motion-safe:animate-[wave-bar_1000ms_ease-in-out_infinite]',
          )}
        />
      ))}
    </div>
  )
}
