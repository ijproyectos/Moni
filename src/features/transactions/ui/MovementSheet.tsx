import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import mascotMoney from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useCategories } from '@/features/categories/api/useCategories'
import { toUserMessage } from '@/shared/lib/errors'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Skeleton } from '@/shared/ui/Skeleton'
import { SegmentedControl, type SegmentOption } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import {
  useCreateTransaction,
  useCreateTransfer,
  useUpdateTransaction,
} from '../api/useTransactions'
import type {
  EntryKind,
  Transaction,
  TransactionFormValues,
  TransferFormValues,
} from '../domain/transaction'
import type { SheetMode } from './movementSheetContext'
import { TransactionForm } from './TransactionForm'
import { TransferForm } from './TransferForm'

interface MovementSheetProps {
  initialMode: SheetMode
  /** Edit mode: prefilled and the kind cannot change. */
  transaction?: Transaction
  onClose: () => void
}

const MODE_OPTIONS: readonly SegmentOption<SheetMode>[] = [
  { value: 'expense', label: 'Gasto', activeClassName: 'bg-blush text-forest' },
  { value: 'income', label: 'Ingreso', activeClassName: 'bg-lime text-forest' },
  { value: 'transfer', label: 'Transferencia', activeClassName: 'bg-forest text-cream' },
]

/** "Nuevo movimiento" sheet (screen 13): expense, income, transfer, or edit of an existing movement. */
export function MovementSheet({ initialMode, transaction, onClose }: MovementSheetProps) {
  const isEdit = Boolean(transaction)
  const [mode, setMode] = useState<SheetMode>(
    transaction ? (transaction.kind as EntryKind) : initialMode,
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const navigate = useNavigate()
  const toast = useToast()

  const accountsQuery = useAccounts({ includeArchived: isEdit })
  const categoriesQuery = useCategories(undefined, { includeArchived: isEdit })
  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const createTransfer = useCreateTransfer()

  const accounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (a) => a.archivedAt === null || a.id === transaction?.accountId,
      ),
    [accountsQuery.data, transaction?.accountId],
  )
  const categories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (c) => c.kind === mode && (c.archivedAt === null || c.id === transaction?.categoryId),
      ),
    [categoriesQuery.data, mode, transaction?.categoryId],
  )

  const isLoading = accountsQuery.isLoading || categoriesQuery.isLoading
  const loadFailed = accountsQuery.isError || categoriesQuery.isError

  async function saveTransaction(values: TransactionFormValues) {
    setSubmitError(null)
    try {
      if (transaction) {
        const { kind: _kind, ...rest } = values
        void _kind
        await updateTransaction.mutateAsync({ id: transaction.id, values: rest })
        toast.show('Movimiento actualizado', { mascotUrl: mascotHappy })
      } else {
        await createTransaction.mutateAsync(values)
        toast.show(values.kind === 'income' ? 'Ingreso guardado' : 'Gasto guardado', {
          mascotUrl: values.kind === 'income' ? mascotMoney : mascotHappy,
        })
      }
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  async function saveTransfer(values: TransferFormValues) {
    setSubmitError(null)
    try {
      await createTransfer.mutateAsync(values)
      toast.show('Transferencia guardada', { mascotUrl: mascotHappy })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  const title = isEdit ? 'Editar movimiento' : 'Nuevo movimiento'
  const segments = isEdit
    ? MODE_OPTIONS.filter((o) => o.value === mode).map((o) => ({ ...o, disabled: true }))
    : MODE_OPTIONS

  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Tipo de movimiento"
          options={segments}
          value={mode}
          onChange={(value) => {
            setSubmitError(null)
            setMode(value)
          }}
        />

        {isLoading ? (
          <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-14 rounded-full" />
            <Skeleton className="h-24" />
          </div>
        ) : loadFailed ? (
          <p role="alert" className="py-6 text-center text-text-muted">
            No pudimos cargar tus cuentas y categorías. Probá de nuevo en un rato.
          </p>
        ) : mode === 'transfer' ? (
          accounts.length < 2 ? (
            <p className="py-6 text-center text-[16px] leading-6 text-text-muted">
              Necesitás al menos dos cuentas para transferir.{' '}
              <Link to="/cuentas" onClick={onClose} className="font-semibold text-forest underline">
                Crear una cuenta
              </Link>
            </p>
          ) : (
            <TransferForm
              accounts={accounts}
              isSubmitting={createTransfer.isPending}
              submitError={submitError}
              onSubmit={(values) => void saveTransfer(values)}
            />
          )
        ) : (
          <TransactionForm
            kind={mode}
            accounts={accounts}
            categories={categories}
            initial={transaction}
            isSubmitting={createTransaction.isPending || updateTransaction.isPending}
            submitError={submitError}
            onSubmit={(values) => void saveTransaction(values)}
            onCreateCategory={() => {
              onClose()
              navigate('/categorias')
            }}
          />
        )}
      </div>
    </BottomSheet>
  )
}
