import { CreditCard, Plus } from 'lucide-react'
import { useState, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router'
import mascotAlert from '@/assets/mascot/expresion_atento.svg'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import { CardsPanel } from '@/features/cards/ui/CardsPanel'
import { InstallmentsPanel } from '@/features/cards/ui/InstallmentsPanel'
import { NewPurchaseSheet } from '@/features/cards/ui/NewPurchaseSheet'
import { useCategories } from '@/features/categories/api/useCategories'
import { MpImportSection } from '@/features/mpImport/ui/MpImportSection'
import { useSavings } from '@/features/goals/api/useSavings'
import { useMovementSheet } from '@/features/transactions/ui/movementSheetContext'
import { toUserMessage } from '@/shared/lib/errors'
import type { AccountKind } from '@/shared/lib/database.types'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { DashedButton, HeaderAddButton } from '@/shared/ui/kit'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useAccounts, useArchiveAccount, useCreateAccount } from '../api/useAccounts'
import {
  ACCOUNT_KIND_LABELS,
  availableCredit,
  isCreditCard,
  type Account,
  type AccountFormValues,
} from '../domain/account'
import type { OpeningOrigin } from '../domain/openingOrigin'
import { brandForAccountName } from '../domain/bankCatalog'
import { skinForAccountName, skinStyle } from '../domain/cardSkins'
import { AccountDetail } from './AccountDetail'
import { AccountForm } from './AccountForm'
import { BrandBadge, BrandCardArt } from './BrandCardArt'
import { BrandLogo } from './BrandLogo'

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

/** The card that was opened (its detail grows from where the card was in the list). */
type Opened = { id: string; tone: string; origin: { top: number; height: number } } | null

/** Medios de pago also hosts the credit-card tools: the cards themselves and the purchases in cuotas. */
type Tab = 'medios' | 'tarjetas' | 'cuotas'

function tabFromParam(value: string | null): Tab {
  return value === 'tarjetas' || value === 'cuotas' ? value : 'medios'
}

/**
 * Medios de pago (063/064): real accounts with derived balances. Tapping one opens its detail (name, balance, transfer
 * data). With a credit card, two more tabs show the card details (statements, limit) and the purchases in cuotas
 * (`?tab=tarjetas|cuotas`).
 */
export function AccountsPage() {
  const accounts = useAccounts()
  const create = useCreateAccount()
  const incomeCategories = useCategories('income').data ?? []
  // What the savings goals reserve in each account (virtual: the real balance is the one shown on the right).
  const reserve = new Map((useSavings().data?.accounts ?? []).map((a) => [a.id, a]))
  const archive = useArchiveAccount()
  const toast = useToast()
  const { openNew } = useMovementSheet()
  const [params, setParams] = useSearchParams()
  const tab = tabFromParam(params.get('tab'))
  const [newPurchase, setNewPurchase] = useState(false)
  const [creating, setCreating] = useState(false)
  const [opened, setOpened] = useState<Opened>(null)
  const [archiving, setArchiving] = useState<Account | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const list = accounts.data ?? []
  const openedAccount = opened ? list.find((a) => a.id === opened.id) : undefined
  const featuredId = list[list.length - 1]?.id
  const hasCards = list.some(isCreditCard)

  function startCreating() {
    setSubmitError(null)
    setCreating(true)
  }

  function openDetail(account: Account, tone: string, card: HTMLElement | null) {
    const rect = card?.getBoundingClientRect()
    setOpened({ id: account.id, tone, origin: { top: rect?.top ?? 0, height: rect?.height ?? 96 } })
  }

  async function save(values: AccountFormValues, origin: OpeningOrigin) {
    setSubmitError(null)
    try {
      await create.mutateAsync({ values, origin })
      toast.show('Medio creado', { mascotUrl: mascotHappy })
      setCreating(false)
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
      setOpened(null)
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
        action={
          tab === 'cuotas' ? (
            <HeaderAddButton label="Nueva compra en cuotas" onClick={() => setNewPurchase(true)} />
          ) : (
            <HeaderAddButton
              label={tab === 'tarjetas' ? 'Agregar tarjeta' : 'Nuevo medio de pago'}
              onClick={startCreating}
            />
          )
        }
      />
      {(hasCards || tab !== 'medios') && (
        <SegmentedControl
          label="Medios, tarjetas o cuotas"
          value={tab}
          onChange={(t) => setParams(t === 'medios' ? {} : { tab: t }, { replace: true })}
          options={[
            { value: 'medios', label: 'Medios' },
            { value: 'tarjetas', label: 'Tarjetas' },
            { value: 'cuotas', label: 'Cuotas' },
          ]}
        />
      )}
      {tab === 'medios' && (
        <p className="-mt-1 text-[16px] text-text-muted">Tocá un medio para ver su detalle.</p>
      )}

      {tab === 'cuotas' ? (
        <InstallmentsPanel />
      ) : tab === 'tarjetas' ? (
        <CardsPanel
          onEdit={(card) => openDetail(card, CARD_TONES[0] ?? 'bg-forest text-cream', null)}
          onAdd={startCreating}
        />
      ) : accounts.isLoading ? (
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
                const brand = brandForAccountName(account.name)
                // Banks and wallets of the catalog wear their own identity; cash and custom media keep Moni's colors.
                const skin = skinForAccountName(account.name)
                const tone =
                  (featured ? CARD_TONES[3] : CARD_TONES[i % 3]) ?? 'bg-forest text-cream'
                return (
                  <li
                    key={account.id}
                    className={cn(i > 0 && '-mt-5', 'relative')}
                    style={{ zIndex: i }}
                  >
                    <div
                      data-account-card
                      className={cn(
                        'relative overflow-hidden rounded-[26px] shadow-[0_-6px_16px_rgba(6,71,53,0.12)]',
                        !skin && tone,
                      )}
                      style={skin ? skinStyle(skin) : undefined}
                    >
                      {skin && <BrandCardArt skin={skin} />}
                      <button
                        type="button"
                        onClick={(e: MouseEvent<HTMLElement>) =>
                          openDetail(account, tone, e.currentTarget.closest('[data-account-card]'))
                        }
                        aria-label={`Abrir ${account.name}`}
                        className="relative flex w-full items-start justify-between gap-3 px-5 pb-8 pt-4 text-left"
                      >
                        <span className="flex items-start gap-3">
                          {brand &&
                            (skin ? (
                              <BrandBadge brand={brand} skin={skin} className="mt-0.5" />
                            ) : (
                              <BrandLogo brand={brand} className="mt-0.5" />
                            ))}
                          <span>
                            <span className="block text-[20px] font-extrabold leading-6">
                              {account.name}
                            </span>
                            <span className="block text-[15px] opacity-80">
                              {KIND_SUBTITLES[account.kind] ?? ACCOUNT_KIND_LABELS[account.kind]}
                              {account.closingDay && account.dueDay
                                ? ` · cierra el ${account.closingDay}`
                                : ''}
                            </span>
                            {!isCreditCard(account) &&
                              (reserve.get(account.id)?.reservedCents ?? 0) > 0 && (
                                <span className="mt-0.5 block text-[14px] font-extrabold">
                                  Reservado para metas{' '}
                                  <AmountDisplay
                                    cents={reserve.get(account.id)?.reservedCents ?? 0}
                                  />{' '}
                                  · {(reserve.get(account.id)?.freeCents ?? 0) < 0 ? '⚠ ' : ''}libre{' '}
                                  <AmountDisplay cents={reserve.get(account.id)?.freeCents ?? 0} />
                                </span>
                              )}
                          </span>
                        </span>
                        {featured ? null : isCreditCard(account) ? (
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
                        <div className="relative px-5 pb-5">
                          {!skin && (
                            <>
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute -right-10 -top-6 size-44 rounded-full bg-white/15"
                              />
                              <span
                                aria-hidden="true"
                                className="pointer-events-none absolute -bottom-16 right-10 size-44 rounded-full bg-white/15"
                              />
                            </>
                          )}
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
                            <span />
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

          <DashedButton onClick={startCreating}>
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

      {/* Mercado Pago auto-import (Plus). It also consumes the ?mp=ok|error callback params. */}
      {tab === 'medios' && <MpImportSection />}

      {creating && (
        <BottomSheet title="Nuevo medio de pago" onClose={() => setCreating(false)}>
          <AccountForm
            isSubmitting={create.isPending}
            submitError={submitError}
            incomeCategories={incomeCategories}
            onSubmit={(values, origin) => void save(values, origin)}
          />
        </BottomSheet>
      )}
      {newPurchase && <NewPurchaseSheet onClose={() => setNewPurchase(false)} />}
      {openedAccount && opened && (
        <AccountDetail
          account={openedAccount}
          tone={opened.tone}
          origin={opened.origin}
          reserve={isCreditCard(openedAccount) ? undefined : reserve.get(openedAccount.id)}
          incomeCategories={incomeCategories}
          canDelete={list.length > 1}
          canPayCard={list.length >= 2}
          onClose={() => setOpened(null)}
          onDelete={() => setArchiving(openedAccount)}
          onPayCard={() => {
            setOpened(null)
            openNew('transfer', { toAccountId: openedAccount.id })
          }}
        />
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
