import { Banknote, Landmark, Plus, Smartphone, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { toUserMessage } from '@/shared/lib/errors'
import type { AccountKind } from '@/shared/lib/database.types'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { IconCircle } from '@/shared/ui/IconCircle'
import { MovementRow } from '@/shared/ui/MovementRow'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import {
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
  useUpdateAccount,
} from '../api/useAccounts'
import {
  ACCOUNT_KIND_LABELS,
  availableBalance,
  type Account,
  type AccountFormValues,
} from '../domain/account'
import { AccountForm } from './AccountForm'

const KIND_ICONS: Record<AccountKind, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  wallet: Smartphone,
}

type Editing = { account?: Account } | null

/** Cuentas ("Medios de pago"): accounts with derived balances, create/edit/archive and transfers. */
export function AccountsPage() {
  const accounts = useAccounts()
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const archive = useArchiveAccount()
  const toast = useToast()
  const { openNew } = useMovementSheet()
  const [editing, setEditing] = useState<Editing>(null)
  const [archiving, setArchiving] = useState<Account | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const list = accounts.data ?? []

  async function save(values: AccountFormValues) {
    setSubmitError(null)
    try {
      if (editing?.account) await update.mutateAsync({ id: editing.account.id, values })
      else await create.mutateAsync(values)
      toast.show(editing?.account ? 'Cuenta actualizada' : 'Cuenta creada', {
        mascotUrl: mascotHappy,
      })
      setEditing(null)
    } catch (e) {
      setSubmitError(toUserMessage(e))
    }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await archive.mutateAsync({ id: archiving.id })
      toast.show('Cuenta archivada')
      setArchiving(null)
      setEditing(null)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setArchiving(null)
    }
  }

  return (
    <section className="flex flex-col gap-4 px-4 pt-12">
      <PageHeader title="Medios de pago" backTo="/mas" />

      {accounts.isLoading ? (
        <div role="status" aria-label="Cargando cuentas" className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : accounts.isError ? (
        <EmptyState
          mascotUrl={mascotAlert}
          title="No pudimos cargar tus cuentas"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={() => void accounts.refetch()}>Reintentar</Button>}
        />
      ) : (
        <>
          <Card className="bg-forest text-cream">
            <p className="text-[15px] text-text-muted-on-dark">Disponible en cuentas</p>
            <AmountDisplay
              cents={availableBalance(list)}
              className="font-display text-[36px] font-bold"
            />
          </Card>

          {list.length === 0 ? (
            <EmptyState
              mascotUrl={mascotHappy}
              title="Todavía no tenés cuentas"
              description="Creá una para empezar a cargar movimientos."
            />
          ) : (
            <Card className="py-1">
              <ul className="divide-y divide-cream">
                {list.map((account) => (
                  <li key={account.id}>
                    <MovementRow
                      leading={<IconCircle icon={KIND_ICONS[account.kind]} color="#064735" />}
                      title={account.name}
                      subtitle={ACCOUNT_KIND_LABELS[account.kind]}
                      trailing={<AmountDisplay cents={account.balanceCents} />}
                      onPress={() => {
                        setSubmitError(null)
                        setEditing({ account })
                      }}
                      pressLabel={`Editar ${account.name}`}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                setSubmitError(null)
                setEditing({})
              }}
            >
              <Plus aria-hidden="true" className="mr-2 size-5" strokeWidth={2.5} />
              Nueva cuenta
            </Button>
            {list.length >= 2 && (
              <Button variant="dark" onClick={() => openNew('transfer')}>
                Transferir
              </Button>
            )}
          </div>
        </>
      )}

      {editing && (
        <BottomSheet
          title={editing.account ? 'Editar cuenta' : 'Nueva cuenta'}
          onClose={() => setEditing(null)}
        >
          <AccountForm
            initial={editing.account}
            isSubmitting={create.isPending || update.isPending}
            submitError={submitError}
            onSubmit={(values) => void save(values)}
            onArchive={
              editing.account && list.length > 1
                ? () => setArchiving(editing.account ?? null)
                : undefined
            }
          />
        </BottomSheet>
      )}
      {archiving && (
        <ConfirmDialog
          title="¿Archivar esta cuenta?"
          message={`"${archiving.name}" deja de aparecer para cargar movimientos. Tu historial se mantiene.`}
          confirmLabel="Archivar"
          isBusy={archive.isPending}
          onConfirm={() => void confirmArchive()}
          onCancel={() => setArchiving(null)}
        />
      )}
    </section>
  )
}
