import { Mic } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import mascotMoney from '@/assets/mascot/personaje_carga-de-dinero.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { isCreditCard } from '@/features/accounts/domain/account'
import { checkOverdraft, type OverdraftWarning } from '@/features/accounts/domain/overdraft'
import { OverdraftSheet } from '@/features/accounts/ui/OverdraftSheet'
import { checkCreditLimit, type CreditLimitWarning } from '@/features/cards/domain/creditLimit'
import { CreditLimitSheet } from '@/features/cards/ui/CreditLimitSheet'
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
import { VoiceSheet } from './VoiceSheet'

interface MovementSheetProps {
  initialMode: SheetMode
  /** Edit mode: prefilled and the kind cannot change. */
  transaction?: Transaction
  /** Transfer tab: destination preselected (paying a credit card). */
  transferTo?: string
  /** Transfer tab: amount prefilled (e.g. the billed debt of the card). */
  transferAmountCents?: number
  onClose: () => void
}

// Screen 019: Gasto / Ingreso. Transfers open from Medios de pago with their own title.
const MODE_OPTIONS: readonly SegmentOption<SheetMode>[] = [
  { value: 'expense', label: 'Gasto', activeClassName: 'bg-blush text-forest' },
  { value: 'income', label: 'Ingreso', activeClassName: 'bg-lime text-forest' },
]

type PendingOverdraft =
  | {
      type: 'limit'
      values: TransactionFormValues
      accountName: string
      warning: CreditLimitWarning
    }
  | {
      type: 'expense'
      values: TransactionFormValues
      accountName: string
      warning: OverdraftWarning
    }
  | { type: 'transfer'; values: TransferFormValues; accountName: string; warning: OverdraftWarning }

/** "Nuevo movimiento" sheet (screen 13): expense, income, transfer, or edit of an existing movement. */
export function MovementSheet({
  initialMode,
  transaction,
  transferTo,
  transferAmountCents,
  onClose,
}: MovementSheetProps) {
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

  // Every way of adding a movement (+ button, Inicio, Cuentas, Actividad) opens this sheet, so the
  // overdraft warning lives here once. The ref stops a double tap from saving the movement twice.
  const [pending, setPending] = useState<PendingOverdraft | null>(null)
  const saving = useRef(false)
  // Escape or a tap outside while the warning is open only dismisses the warning, not the whole sheet.
  const pendingRef = useRef(pending)
  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  /** Fresh balances right before saving: another movement may have changed them since the sheet opened. */
  async function currentAccounts() {
    const fresh = await accountsQuery.refetch()
    return fresh.data ?? accountsQuery.data ?? []
  }

  async function saveTransaction(values: TransactionFormValues) {
    if (saving.current) return
    setSubmitError(null)
    if (values.kind === 'expense') {
      const account = (await currentAccounts()).find((a) => a.id === values.accountId)
      // Editing: the movement's own amount is already inside the balance when the account is unchanged.
      const released =
        transaction?.kind === 'expense' && transaction.accountId === values.accountId
          ? transaction.amountCents
          : 0
      // A credit card runs on debt, not on money in hand: buying with it never "falls short".
      if (account && isCreditCard(account)) {
        // A card runs on credit, not on money in hand: the only limit is the credit limit.
        const limitWarning = checkCreditLimit({
          limitCents: account.creditLimitCents,
          balanceCents: account.balanceCents,
          amountCents: values.amount,
          releasedCents: released,
        })
        if (limitWarning) {
          setPending({ type: 'limit', values, accountName: account.name, warning: limitWarning })
          return
        }
      }
      const warning =
        account && !isCreditCard(account)
          ? checkOverdraft({
              balanceCents: account.balanceCents,
              amountCents: values.amount,
              releasedCents: released,
            })
          : null
      if (account && warning) {
        setPending({ type: 'expense', values, accountName: account.name, warning })
        return
      }
    }
    await commitTransaction(values)
  }

  async function commitTransaction(values: TransactionFormValues) {
    if (saving.current) return
    saving.current = true
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
    } finally {
      saving.current = false
      setPending(null)
    }
  }

  async function saveTransfer(values: TransferFormValues) {
    if (saving.current) return
    setSubmitError(null)
    const account = (await currentAccounts()).find((a) => a.id === values.fromAccountId)
    const warning =
      account && !isCreditCard(account)
        ? checkOverdraft({ balanceCents: account.balanceCents, amountCents: values.amount })
        : null
    if (account && warning) {
      setPending({ type: 'transfer', values, accountName: account.name, warning })
      return
    }
    await commitTransfer(values)
  }

  async function commitTransfer(values: TransferFormValues) {
    if (saving.current) return
    saving.current = true
    setSubmitError(null)
    try {
      await createTransfer.mutateAsync(values)
      toast.show('Transferencia guardada', { mascotUrl: mascotHappy })
      onClose()
    } catch (e) {
      setSubmitError(toUserMessage(e))
    } finally {
      saving.current = false
      setPending(null)
    }
  }

  const [voice, setVoice] = useState(false)
  const title = isEdit
    ? 'Editar movimiento'
    : mode === 'transfer'
      ? 'Transferencia'
      : 'Nuevo movimiento'
  const segments = isEdit
    ? MODE_OPTIONS.filter((o) => o.value === mode).map((o) => ({ ...o, disabled: true }))
    : MODE_OPTIONS

  if (voice) return <VoiceSheet onClose={() => setVoice(false)} />

  return (
    <BottomSheet title={title} onClose={() => (pendingRef.current ? setPending(null) : onClose())}>
      <div className="flex flex-col gap-4">
        {mode !== 'transfer' && (
          <SegmentedControl
            label="Tipo de movimiento"
            options={segments}
            value={mode}
            onChange={(value) => {
              setSubmitError(null)
              setMode(value)
            }}
          />
        )}

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
              defaultToAccountId={transferTo}
              defaultAmountCents={transferAmountCents}
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
        {!isEdit && mode !== 'transfer' && (
          <button
            type="button"
            onClick={() => setVoice(true)}
            className="-mt-1 flex min-h-11 items-center justify-center gap-2 text-[17px] font-extrabold underline"
          >
            <Mic aria-hidden="true" className="size-5" /> Mejor lo digo con la voz
          </button>
        )}
      </div>
      {pending?.type === 'limit' && (
        <CreditLimitSheet
          cardName={pending.accountName}
          warning={pending.warning}
          isBusy={createTransaction.isPending || updateTransaction.isPending}
          onCancel={() => setPending(null)}
          onContinue={() => void commitTransaction(pending.values)}
        />
      )}
      {pending && pending.type !== 'limit' && (
        <OverdraftSheet
          accountName={pending.accountName}
          warning={pending.warning}
          movement={pending.type}
          isBusy={
            createTransaction.isPending || updateTransaction.isPending || createTransfer.isPending
          }
          onCancel={() => setPending(null)}
          onContinue={() =>
            void (pending.type === 'expense'
              ? commitTransaction(pending.values)
              : commitTransfer(pending.values))
          }
        />
      )}
    </BottomSheet>
  )
}
