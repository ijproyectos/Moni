import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'ghost'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'h-14 short:h-12 w-full bg-forest text-cream hover:brightness-110 active:brightness-95 dark:bg-lime dark:text-on-bright dark:hover:brightness-95',
  secondary:
    'h-12 w-full border border-line bg-white text-ink hover:brightness-95 active:brightness-90 dark:bg-card',
  dark: 'h-14 short:h-12 w-full bg-forest text-cream hover:brightness-110 active:brightness-95 dark:bg-surface',
  ghost: 'min-h-11 px-4 bg-transparent text-current !font-bold text-[17px] hover:underline',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-full font-display text-lg font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}
