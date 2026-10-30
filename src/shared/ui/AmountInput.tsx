import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'prefix'> {
  /** Sign or currency shown before the number, e.g. "-$" or "$". */
  prefix?: string
  invalid?: boolean
  scale?: 'lg' | 'md'
}

/** Big amount field; the text is parsed by `parseAmountInput` (es-AR) when the form is validated. */
export function AmountInput({
  prefix = '$',
  invalid,
  scale = 'lg',
  className,
  placeholder = '0',
  ...props
}: AmountInputProps) {
  return (
    <div
      className={cn(
        'flex items-baseline gap-2 border-b-2 pb-1',
        invalid ? 'border-expense' : 'border-sand',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'font-display font-extrabold text-ink',
          scale === 'lg' ? 'text-3xl' : 'text-xl',
        )}
      >
        {prefix}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        className={cn(
          'min-w-0 flex-1 bg-transparent font-display font-extrabold text-ink outline-none placeholder:text-text-muted/40',
          scale === 'lg' ? 'text-[56px] leading-[64px]' : 'text-2xl leading-9',
        )}
        {...props}
      />
    </div>
  )
}
