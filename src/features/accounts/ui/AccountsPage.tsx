import { Copy, CreditCard, Plus } from 'lucide-react'
import { useState } from 'react'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { toUserMessage } from '@/shared/lib/errors'
import type { AccountKind } from '@/shared/lib/database.types'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { DashedButton, HeaderAddButton, SectionLabel, Toggle } from '@/shared/ui/kit'
import { copyText } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
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
  availableCredit,
  isCreditCard,
  type Account,
  type AccountFormValues,
} from '../domain/account'
import { setAccountAlias, useAccountAliases, type AccountAlias } from '../mock/aliasStore'
import { CardSummarySection } from '@/features/cards/ui/CardSummarySection'
import { AccountForm } from './AccountForm'
import { AdjustBalanceSection } from './AdjustBalanceSection'

const KIND_SUBTITLES: Record<AccountKind, string> = {
  cash: 'Billetes que tenés encima',
  bank: 'Banco',
  wallet: 'Billetera virtual',
  credit_card: 'Tarjeta de crédito',
}

/** Card colors, in stacking order (screen 063). */
const CARD_TONES = [
  'bg-forest text-cream',
  'bg-gold text-forest',
  'bg-cream text-forest',
  'bg-lime text-forest',
]

type Editing = { account?: Account } | null

/** Medios de pago (063/064): real accounts with derived balances; the alias is simulated. */
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
  const aliases = useAccountAliases()
  const [aliasDraft, setAliasDraft] = useState<AccountAlias>({ alias: '', forCollecting: false })

  const list = accounts.data ?? []
  const featuredId = list.find((a) => aliases[a.id]?.forCollecting)?.id ?? list[list.length - 1]?.id

  function startEditing(account?: Account) {
    setSubmitError(null)
    setAliasDraft(
      account
        ? (aliases[account.id] ?? { alias: '', forCollecting: false })
        : { alias: '', forCollecting: false },
    )
    setEditing(account ? { account } : {})
  }

  async function save(values: AccountFormValues) {
    setSubmitError(null)
    try {
      if (editing?.account) {
        await update.mutateAsync({
          id: editing.account.id,
          values,
          previousKind: editing.account.kind,
        })
        setAccountAlias(editing.account.id, { ...aliasDraft, alias: aliasDraft.alias.trim() })
      } else await create.mutateAsync(values)
      toast.show(editing?.account ? 'Medio actualizado' : 'Medio creado', {
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
      toast.show('Medio eliminado')
      setArchiving(null)
      setEditing(null)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setArchiving(null)
    }
  }

  return (
    <section className="flex flex-col gap-4 px-4 pt-14">
      <PageHeader
        title="Medios de pago"
        backTo="/mas"
        action={<HeaderAddButton label="Nuevo medio de pago" onClick={() => startEditing()} />}
      />
      <p className="-mt-1 text-[16px] text-text-muted">
        Tocá una tarjeta para cargar o cambiar su alias.
      </p>

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
          {list.length === 0 ? (
            <EmptyState
              mascotUrl={mascotHappy}
              title="Todavía no tenés medios de pago"
              description="Creá uno para empezar a cargar movimientos."
            />
          ) : (
            <ul aria-label="Medios de pago" className="flex flex-col">
              {list.map((account, i) => {
                const featured = account.id === featuredId
                const alias = aliases[account.id]
                const tone = featured ? CARD_TONES[3] : CARD_TONES[i % 3]
                return (
                  <li
                    key={account.id}
                    className={cn(i > 0 && '-mt-5', 'relative')}
                    style={{ zIndex: i }}
                  >
                    <div
                      className={cn(
                        'relative overflow-hidden rounded-[26px] shadow-[0_-6px_16px_rgba(6,71,53,0.12)]',
                        tone,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => startEditing(account)}
                        aria-label={`Editar ${account.name}`}
                        className="flex w-full items-start justify-between gap-3 px-5 pb-8 pt-4 text-left"
                      >
                        <span>
                          <span className="block text-[20px] font-extrabold leading-6">
                            {account.name}
                          </span>
                          <span className="block text-[15px] opacity-80">
                            {KIND_SUBTITLES[account.kind] ?? ACCOUNT_KIND_LABELS[account.kind]}
                            {account.closingDay && account.dueDay
                              ? ` · cierra el ${account.closingDay}`
                              : ''}
                            {!featured && alias?.alias ? ` · ${alias.alias}` : ''}
                          </span>
                        </span>
                        {featured ? (
                          alias?.forCollecting && (
                            <span className="rounded-full bg-forest px-3 py-1 text-[13px] font-extrabold text-lime">
                              Para cobrar
                            </span>
                          )
                        ) : isCreditCard(account) ? (
                          <span className="text-right">
                            <span className="block text-[13px] opacity-80">
                              {account.balanceCents > 0 ? 'A favor' : 'Deuda'}
                            </span>
                            <AmountDisplay
                              cents={Math.abs(account.balanceCents)}
                              className="text-[19px] font-extrabold"
                            />
                            {availableCredit(account) !== null && (
                              <span className="block text-[13px] opacity-80">
                                Disponible <AmountDisplay cents={availableCredit(account) ?? 0} />
                              </span>
                            )}
                          </span>
                        ) : (
                          <AmountDisplay
                            cents={account.balanceCents}
                            className="text-[19px] font-extrabold"
                          />
                        )}
                      </button>
                      {featured && (
                        <div className="px-5 pb-5">
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -right-10 -top-6 size-44 rounded-full bg-white/15"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-16 right-10 size-44 rounded-full bg-white/15"
                          />
                          <p className="text-[15px]">
                            {isCreditCard(account)
                              ? account.balanceCents > 0
                                ? 'A favor'
                                : 'Deuda'
                              : 'Saldo'}
                          </p>
                          <AmountDisplay
                            cents={
                              isCreditCard(account)
                                ? Math.abs(account.balanceCents)
                                : account.balanceCents
                            }
                            className="block font-display text-[40px] font-extrabold leading-[46px]"
                          />
                          {isCreditCard(account) && availableCredit(account) !== null && (
                            <p className="text-[15px]">
                              Disponible{' '}
                              <AmountDisplay
                                cents={availableCredit(account) ?? 0}
                                className="font-extrabold"
                              />
                            </p>
                          )}
                          <div className="mt-3 flex items-center justify-between">
                            {alias?.alias ? (
                              <button
                                type="button"
                                onClick={() => void copyText(alias.alias, toast, 'Alias copiado')}
                                className="relative flex min-h-11 items-center gap-2 rounded-full bg-white/60 px-4 text-[17px] font-extrabold"
                              >
                                <Copy aria-hidden="true" className="size-4" /> {alias.alias}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditing(account)}
                                className="relative flex min-h-11 items-center gap-2 rounded-full bg-white/60 px-4 text-[16px] font-extrabold"
                              >
                                <Plus aria-hidden="true" className="size-4" /> Cargar alias
                              </button>
                            )}
                            <CreditCard aria-hidden="true" className="relative size-7" />
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <DashedButton onClick={() => startEditing()}>
            <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
            Agregar otro medio
          </DashedButton>
          {list.length >= 2 && (
            <Button variant="dark" onClick={() => openNew('transfer')}>
              Transferir entre medios
            </Button>
          )}
        </>
      )}

      {editing && (
        <BottomSheet
          title={editing.account ? editing.account.name : 'Nuevo medio de pago'}
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
          >
            {editing.account && (
              <>
                <AdjustBalanceSection account={editing.account} onDone={() => setEditing(null)} />
                {isCreditCard(editing.account) && (
                  <CardSummarySection
                    accountId={editing.account.id}
                    onPay={(amountCents) => {
                      const card = editing.account
                      setEditing(null)
                      if (card) openNew('transfer', { toAccountId: card.id, amountCents })
                    }}
                  />
                )}
                {isCreditCard(editing.account) && list.length >= 2 && (
                  <Button
                    variant="dark"
                    onClick={() => {
                      const card = editing.account
                      setEditing(null)
                      if (card) openNew('transfer', { toAccountId: card.id })
                    }}
                  >
                    Pagar otro monto
                  </Button>
                )}
                <AliasFields value={aliasDraft} onChange={setAliasDraft} />
              </>
            )}
          </AccountForm>
        </BottomSheet>
      )}
      {archiving && (
        <ConfirmDialog
          title="¿Eliminar este medio?"
          message={`"${archiving.name}" deja de aparecer para cargar movimientos. Tu historial se mantiene.`}
          confirmLabel="Eliminar"
          isBusy={archive.isPending}
          onConfirm={() => void confirmArchive()}
          onCancel={() => setArchiving(null)}
        />
      )}
    </section>
  )
}

function AliasFields({
  value,
  onChange,
}: {
  value: AccountAlias
  onChange: (v: AccountAlias) => void
}) {
  const toast = useToast()
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Alias</SectionLabel>
      <div className="flex h-16 items-center rounded-[18px] border-2 border-forest bg-white pl-4 pr-2">
        <input
          value={value.alias}
          onChange={(e) => onChange({ ...value, alias: e.target.value })}
          placeholder="tunombre.mp"
          aria-label="Alias"
          maxLength={40}
          className="min-w-0 flex-1 bg-transparent text-[20px] font-extrabold outline-none placeholder:font-normal placeholder:text-text-muted"
        />
        {value.alias && (
          <button
            type="button"
            aria-label="Copiar alias"
            onClick={() => void copyText(value.alias, toast, 'Alias copiado')}
            className="flex size-11 items-center justify-center"
          >
            <Copy aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <p className="text-[14px] text-text-muted">
        Es lo que les va a aparecer a los demás para pasarte la plata.
      </p>
      <div className="flex items-center gap-3 rounded-[18px] border border-sand bg-white px-4 py-3">
        <span className="flex-1">
          <span className="block text-[17px] font-extrabold">Usar para que me paguen</span>
          <span className="block text-[14px] text-text-muted">Aparece en tus resúmenes</span>
        </span>
        <Toggle
          label="Usar para que me paguen"
          checked={value.forCollecting}
          onChange={(forCollecting) => onChange({ ...value, forCollecting })}
        />
      </div>
    </div>
  )
}
