import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { cleanCodeInput, INVITE_CODE_PATTERN } from '../domain/group'
import { fieldClass } from './styles'

interface JoinCodeFormProps {
  isSubmitting: boolean
  submitError: string | null
  onSubmit: (code: string) => void
}

/** Code entry (invite codes are 12 characters). Emits the normalized code. */
export function JoinCodeForm({ isSubmitting, submitError, onSubmit }: JoinCodeFormProps) {
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const valid = INVITE_CODE_PATTERN.test(code)

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setTouched(true)
        if (valid) onSubmit(code)
      }}
    >
      <p className="text-[16px] leading-6 text-text-muted">
        Pedile el código a quien armó el grupo. Tiene 12 letras o números.
      </p>
      <div>
        <input
          type="text"
          aria-label="Código del grupo"
          placeholder="ABCD2345WXYZ"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(cleanCodeInput(event.target.value))}
          aria-invalid={(touched && !valid) || undefined}
          className={`${fieldClass} text-center font-display text-2xl font-semibold uppercase tracking-[0.15em]`}
          data-autofocus
        />
        {touched && !valid && (
          <p role="alert" className="mt-1 px-2 text-sm text-expense">
            El código tiene 12 letras o números.
          </p>
        )}
      </div>
      {submitError && (
        <p role="alert" className="text-center text-sm text-expense">
          {submitError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando…' : 'Entrar al grupo'}
      </Button>
    </form>
  )
}
