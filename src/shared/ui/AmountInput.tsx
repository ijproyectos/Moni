import type { InputHTMLAttributes } from 'react'
import { withAmountFormatting } from './amountField'
import { cn } from './cn'

interface AmountInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'prefix'> {
  /** Sign or currency shown before the number, e.g. "-$" or "$". */
  prefix?: string
  invalid?: boolean
  scale?: 'lg' | 'md' | 'hero'
}

/** Big amount field; the text is parsed by `parseAmountInput` (es-AR) when the form is validated. */
export function AmountInput({
  prefix = '$',
  invalid,
  scale = 'lg',
  className,
  placeholder = '0',
  onChange,
  ...props
}: AmountInputProps) {
  const hero = scale === 'hero'
  return (
    <div
      className={cn(
        hero
          ? 'flex items-baseline justify-center'
          : cn('flex items-baseline gap-2 border-b-2 pb-1', invalid ? 'border-expense' : 'border-line'),
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'font-display text-ink',
          hero
            ? 'text-[52px] font-bold leading-none tracking-[-0.04em]'
            : cn('font-extrabold', scale === 'lg' ? 'text-3xl short:text-2xl' : 'text-xl'),
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
          'min-w-0 bg-transparent font-display text-ink outline-none placeholder:text-text-muted/40',
          hero
            ? 'w-[1ch] min-w-[1ch] max-w-full text-[52px] font-bold leading-none tracking-[-0.04em] [field-sizing:content]'
            : cn(
                'flex-1 font-extrabold',
                scale === 'lg'
                  ? 'text-[56px] leading-[64px] short:text-[44px] short:leading-[52px]'
                  : 'text-2xl leading-9',
              ),
          hero && invalid && 'text-expense',
        )}
        {...props}
        onChange={withAmountFormatting(onChange)}
      />
    </div>
  )
}
