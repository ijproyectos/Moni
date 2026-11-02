import { useMemo, useState } from 'react'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useCategories, useCategoryTemplates } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { MoniSays } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useConvertSharedToExpense } from '../api/useGroups'
import type { LedgerExpense } from '../domain/ledger'
import { fieldClass, labelClass } from './styles'

/**
 * The payer turns a shared expense into an individual one: the group no longer counts it and it becomes a normal
 * expense of theirs for the full amount, on the account and category they choose. Done in one step on the server.
 */
export function ConvertToPersonalSheet({
  expense,
  defaultAccountId,
  onClose,
  onDone,
}: {
  expense: LedgerExpense
  /** The account the shared expense was paid from, when it was paid from one. */
  defaultAccountId: string | null
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories('expense')
  const templatesQuery = useCategoryTemplates()
  const convert = useConvertSharedToExpense()
  const [accountId, setAccountId] = useState(defaultAccountId ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  // The shared expense's category is a template; the person's own category with the same name is the natural pick.
  const suggested = useMemo(() => {
    const name = templatesQuery.data
      ?.find((t) => t.slug === expense.templateSlug)
      ?.name?.toLowerCase()
    return categories.find((c) => c.name.toLowerCase() === name)?.id ?? ''
  }, [templatesQuery.data, categories, expense.templateSlug])
  const chosenCategory = categoryId || suggested || categories[0]?.id || ''
  const chosenAccount = accountId || accounts[0]?.id || ''

  const loading = accountsQuery.isLoading || categoriesQuery.isLoading || templatesQuery.isLoading
  const failed = accountsQuery.isError || categoriesQuery.isError

  async function submit() {
    setError(null)
    try {
      await convert.mutateAsync({
        kind: expense.source === 'real' ? 'shared' : 'guest',
        id: expense.id,
        accountId: chosenAccount,
        categoryId: chosenCategory,
        note: expense.description,
      })
      toast.show('Ahora es un gasto individual', { mascotUrl: mascotHappy })
      onDone()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  return (
    <BottomSheet title="Pasar a gasto individual" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[16px] leading-6">
          «{expense.description}» deja de ser del grupo: los demás ya no te deben su parte y queda
          como gasto tuyo por el total, {formatArs(expense.amountCents)}.
        </p>
        {loading ? (
          <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : failed ? (
          <p role="alert" className="py-4 text-center text-text-muted">
            No pudimos cargar tus cuentas y categorías. Probá de nuevo en un rato.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Cuenta</span>
              <select
                className={fieldClass}
                aria-label="Cuenta"
                value={chosenAccount}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Categoría</span>
              <select
                className={fieldClass}
                aria-label="Categoría"
                value={chosenCategory}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <MoniSays lead="Una sola vez:">
              si el gasto compartido se pagó desde una cuenta, esa plata vuelve y se descuenta de la
              cuenta que elijas acá. No se cuenta dos veces.
            </MoniSays>
          </>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button
          onClick={() => void submit()}
          disabled={convert.isPending || loading || failed || !chosenAccount || !chosenCategory}
        >
          {convert.isPending ? 'Guardando…' : 'Pasar a individual'}
        </Button>
      </div>
    </BottomSheet>
  )
}
