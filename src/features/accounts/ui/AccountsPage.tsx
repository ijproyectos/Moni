import { Banknote, CreditCard, Landmark, Plus, WalletCards, type LucideIcon } from 'lucide-react'
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
import { DashedButton } from '@/shared/ui/kit'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MENTA_CIRCLE } from '@/shared/ui/mentaStyles'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useAccounts, useArchiveAccount, useCreateAccount } from '../api/useAccounts'
import {
  ACCOUNT_KIND_LABELS,
  availableBalance,
  availableCredit,
  isCreditCard,
  type Account,
  type AccountFormValues,
} from '../domain/account'
import type { OpeningOrigin } from '../domain/openingOrigin'
import { brandForAccountName } from '../domain/bankCatalog'
import { skinForAccountName } from '../domain/cardSkins'
import { AccountDetail } from './AccountDetail'
import { AccountForm } from './AccountForm'
import { BrandBadge } from './BrandCardArt'
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
  'bg-surface text-cream',
  'bg-[#3f6b57] text-cream',
  'bg-[#6f8f5a] text-white',
]

const KIND_ICONS: Record<AccountKind, { icon: LucideIcon; tile: string }> = {
  bank: { icon: Landmark, tile: 'bg-tint-green text-mint-ink' },
  wallet: { icon: WalletCards, tile: 'bg-tint-blue text-[#285A86] dark:text-ink' },
  cash: { icon: Banknote, tile: 'bg-tint-gold text-[#5A4300] dark:text-ink' },
  credit_card: { icon: CreditCard, tile: 'bg-tint-violet text-[#4A3F96] dark:text-ink' },
}

/** Row of Medios de pago: tinted icon (or the entity's logo), name, subtitle and balance / card debt. */
function AccountRow({
  account,
  last,
  reserve,
  onOpen,
}: {
  account: Account
  last: boolean
  reserve: { reservedCents: number; freeCents: number } | undefined
  onOpen: (card: HTMLElement | null) => void
}) {
  const brand = brandForAccountName(account.name)
  // Banks and wallets of the catalog wear their own identity; cash and custom media keep the tinted icon.
  const skin = skinForAccountName(account.name)
  const { icon: Icon, tile } = KIND_ICONS[account.kind] ?? KIND_ICONS.bank
  const card = isCreditCard(account)
  const credit = card ? availableCredit(account) : null
  return (
    <li data-account-card className={cn('border-line', !last && 'border-b')}>
      <button
        type="button"
        onClick={(e: MouseEvent<HTMLElement>) => onOpen(e.currentTarget.closest('[data-account-card]'))}
        aria-label={`Abrir ${account.name}`}
        className={cn('grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 py-[9px] text-left', FOCUS_RING)}
      >
        {brand ? (
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white"
          >
            {skin ? <BrandBadge brand={brand} skin={skin} size="sm" /> : <BrandLogo brand={brand} size="sm" />}
          </span>
        ) : (
          <span aria-hidden="true" className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tile)}>
            <Icon className="size-[18px]" strokeWidth={2} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{account.name}</span>
          <span className="block text-[12px] text-text-muted">
            {KIND_SUBTITLES[account.kind] ?? ACCOUNT_KIND_LABELS[account.kind]}
            {card && account.closingDay && account.dueDay ? ` · cierra el ${account.closingDay}` : ''}
          </span>
          {!card && (reserve?.reservedCents ?? 0) > 0 && (
            <span className="block text-[12px] font-semibold text-text-muted">
              Reservado para metas <AmountDisplay cents={reserve?.reservedCents ?? 0} /> ·{' '}
              {(reserve?.freeCents ?? 0) < 0 ? '⚠ ' : ''}libre <AmountDisplay cents={reserve?.freeCents ?? 0} />
            </span>
          )}
        </span>
        {card ? (
          <span className="text-right">
            <span className="block text-[12px] text-text-muted">{account.balanceCents > 0 ? 'A favor' : 'Deuda'}</span>
            <AmountDisplay cents={Math.abs(account.balanceCents)} className="whitespace-nowrap text-[15px] font-semibold" />
            {credit !== null && (
              <span className="block text-[12px] text-text-muted">
                Disponible <AmountDisplay cents={credit} />
              </span>
            )}
          </span>
        ) : (
          <AmountDisplay cents={account.balanceCents} className="whitespace-nowrap text-[15px] font-semibold" />
        )}
      </button>
    </li>
  )
}

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
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader
        title="Medios de pago"
        subtitle={accounts.data ? `${list.length} ${list.length === 1 ? 'medio' : 'medios'}` : undefined}
        backTo="/perfil"
        action={
          <button
            type="button"
            onClick={tab === 'cuotas' ? () => setNewPurchase(true) : startCreating}
            aria-label={
              tab === 'cuotas'
                ? 'Nueva compra en cuotas'
                : tab === 'tarjetas'
                  ? 'Agregar tarjeta'
                  : 'Nuevo medio de pago'
            }
            className={MENTA_CIRCLE}
          >
            <Plus aria-hidden="true" className="size-5" strokeWidth={2.2} />
          </button>
        }
      />
      {(hasCards || tab !== 'medios') && (
        <SegmentedControl
          label="Medios, tarjetas o cuotas"
          variant="menta"
          value={tab}
          onChange={(t) => setParams(t === 'medios' ? {} : { tab: t }, { replace: true })}
          options={[
            { value: 'medios', label: 'Medios' },
            { value: 'tarjetas', label: 'Tarjetas' },
            { value: 'cuotas', label: 'Cuotas' },
          ]}
        />
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
            <>
              <section aria-label="Saldo en cuentas" className="flex flex-col gap-1.5 rounded-[30px] bg-mint px-[18px] py-4 text-white">
                <Kicker as="h2" className="font-medium text-[#CBEBD9]">
                  Saldo en cuentas
                </Kicker>
                <AmountDisplay
                  cents={availableBalance(list)}
                  className="text-[42px] font-bold leading-none tracking-[-0.04em]"
                />
                <p className="text-[13.5px] text-[#DDF3E6]">Sin contar tarjetas de crédito</p>
              </section>
              {[
                { title: 'Cuentas y billeteras', items: list.filter((a) => !isCreditCard(a)) },
                { title: 'Tarjetas de crédito', items: list.filter(isCreditCard) },
              ]
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <div key={group.title} className="flex flex-col gap-2">
                    <Kicker as="h2">{group.title}</Kicker>
                    <ul aria-label={group.title} className="rounded-[26px] bg-card px-4 py-0.5">
                      {group.items.map((account, i) => {
                        const index = list.indexOf(account)
                        const tone = CARD_TONES[index % 3] ?? 'bg-forest text-cream'
                        return (
                          <AccountRow
                            key={account.id}
                            account={account}
                            last={i === group.items.length - 1}
                            reserve={reserve.get(account.id)}
                            onOpen={(card) => openDetail(account, tone, card)}
                          />
                        )
                      })}
                    </ul>
                  </div>
                ))}
            </>
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
