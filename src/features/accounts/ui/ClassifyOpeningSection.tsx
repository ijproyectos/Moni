import { useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import type { Category } from '@/features/categories/domain/category'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { SectionLabel } from '@/shared/ui/kit'
import { useToast } from '@/shared/ui/toastContext'
import { useClassifyOpeningBalance } from '../api/useAccounts'
import type { Account } from '../domain/account'
import { defaultOpeningOrigin, originProblem, type OpeningOrigin } from '../domain/openingOrigin'
import { OpeningOriginFields } from './OpeningOriginFields'

/**
 * For an account created before Moni asked where the money came from: its starting balance is only a
 * number on the account. Classifying it records one movement of the same amount, so Actividad and the
 * reports see it while the balance stays exactly as it is. Nothing is converted unless the person asks.
 */
export function ClassifyOpeningSection({
  account,
  incomeCategories,
  onDone,
}: {
  account: Account
  incomeCategories: readonly Category[]
  onDone: () => void
}) {
  const toast = useToast()
  const classify = useClassifyOpeningBalance()
  const [origin, setOrigin] = useState<OpeningOrigin>(() => defaultOpeningOrigin(todayIso()))
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    const problem = originProblem(origin)
    setError(problem)
    if (problem) return
    try {
      await classify.mutateAsync({ id: account.id, origin })
      toast.show('Saldo inicial clasificado', { mascotUrl: mascotHappy })
      onDone()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Clasificar saldo inicial</SectionLabel>
      <p className="text-[14px] leading-5 text-text-muted">
        Este medio arrancó con {formatArs(account.openingBalanceCents)}, que todavía no figuran en
        Actividad. Contanos de dónde vienen y Moni los registra sin volver a sumarlos al saldo.
      </p>
      <OpeningOriginFields
        value={origin}
        onChange={(next) => {
          setError(null)
          setOrigin(next)
        }}
        categories={incomeCategories}
        error={error}
      />
      <Button variant="dark" onClick={() => void apply()} disabled={classify.isPending}>
        {classify.isPending ? 'Guardando…' : 'Clasificar saldo inicial'}
      </Button>
    </div>
  )
}
