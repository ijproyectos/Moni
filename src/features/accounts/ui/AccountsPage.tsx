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

/** Height of a card and how much of each back card stays visible in the stack (px). */
const CARD_H = 188
const PEEK = 68

/**
 * A payment method as a wallet card: the entity's own colors and art when it is in the catalog, Moni's tones otherwise.
 * The top strip (logo, name, balance) is what shows when it sits behind others; the front card also shows the entity,
 * the alias for transfers and the rest of its real data. A back card comes to the front when tapped; tapping the front
 * card opens its detail.
 */
function AccountCard({
  account,
  tone,
  reserve,
  front,
  first,
  onSelect,
}: {
  account: Account
  tone: string
  reserve: { reservedCents: number; freeCents: number } | undefined
  front: boolean
  first: boolean
  onSelect: (card: HTMLElement | null) => void
}) {
  const brand = brandForAccountName(account.name)
  // Banks and wallets of the catalog wear their own identity; cash and custom media keep Moni's tones.
  const skin = skinForAccountName(account.name)
  const { icon: Icon } = KIND_ICONS[account.kind] ?? KIND_ICONS.bank
  const card = isCreditCard(account)
  const credit = card ? availableCredit(account) : null
  const reserved = !card ? (reserve?.reservedCents ?? 0) : 0
  return (
    <li className="relative" style={{ marginTop: first ? 0 : PEEK - CARD_H }} data-front={front || undefined}>
      <div
        data-account-card
        className={cn(
          'relative overflow-hidden rounded-[22px] shadow-[0_-4px_14px_rgba(6,40,31,0.18)] ring-1 ring-black/10 motion-safe:transition-transform motion-safe:duration-200',
          front && 'motion-safe:animate-[story-in_200ms_ease-out]',
          !skin && tone,
        )}
        style={{ height: CARD_H, ...(skin ? skinStyle(skin) : {}) }}
      >
        {skin ? (
          <BrandCardArt skin={skin} />
        ) : (
          <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-white/10" />
        )}
        <button
          type="button"
          onClick={(e: MouseEvent<HTMLElement>) => onSelect(e.currentTarget.closest('[data-account-card]'))}
          aria-label={`Abrir ${account.name}`}
          className={cn('relative flex h-full w-full flex-col justify-between px-4 pb-3.5 pt-3.5 text-left', FOCUS_RING)}
        >
          <span className="flex items-start gap-3">
            {brand ? (
              skin ? (
                <BrandBadge brand={brand} skin={skin} size="sm" />
              ) : (
                <BrandLogo brand={brand} size="sm" />
              )
            ) : (
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white/20">
                <Icon className="size-4" strokeWidth={2} />
              </span>
            )}
            <span className="min-w-0 flex-1 pt-px">
              <span className="block truncate text-[16px] font-extrabold leading-tight">{account.name}</span>
              <span className="block truncate text-[12px] opacity-80">
                {KIND_SUBTITLES[account.kind] ?? ACCOUNT_KIND_LABELS[account.kind]}
              </span>
            </span>
            <span className="shrink-0 text-right">
              {card && <span className="block text-[11px] leading-3 opacity-80">{account.balanceCents > 0 ? 'A favor' : 'Deuda'}</span>}
              <AmountDisplay
                cents={card ? Math.abs(account.balanceCents) : account.balanceCents}
                className="whitespace-nowrap text-[17px] font-extrabold leading-tight"
              />
            </span>
          </span>
          <span className="flex flex-col gap-0.5 text-[12.5px]">
            {brand && <span className="truncate opacity-90">Entidad: {brand.name}</span>}
            {account.transferAlias && <span className="truncate font-semibold">Alias: {account.transferAlias}</span>}
            {card && account.closingDay && account.dueDay && (
              <span className="opacity-90">Cierra el {account.closingDay} · vence el {account.dueDay}</span>
            )}
            {credit !== null && (
              <span className="opacity-90">
                Disponible <AmountDisplay cents={credit} />
              </span>
            )}
            {reserved > 0 && (
              <span className="font-semibold">
                Reservado para metas <AmountDisplay cents={reserved} /> · {(reserve?.freeCents ?? 0) < 0 ? '⚠ ' : ''}libre{' '}
                <AmountDisplay cents={reserve?.freeCents ?? 0} />
              </span>
            )}
            <span className="mt-0.5 self-end text-[12px] font-bold opacity-90">{front ? 'Ver detalle ›' : ''}</span>
          </span>
        </button>
      </div>
    </li>
  )
}

/** One group of media as a slightly overlapped stack of cards; the one tapped comes to the front. */
function CardStack({
  title,
  items,
  list,
  reserve,
  onOpen,
}: {
  title: string
  items: Account[]
  list: Account[]
  reserve: Map<string, { reservedCents: number; freeCents: number }>
  onOpen: (account: Account, tone: string, card: HTMLElement | null) => void
}) {
  const [frontId, setFrontId] = useState<string | null>(null)
  const frontAccount = items.find((a) => a.id === frontId) ?? items[items.length - 1]
  const ordered = [...items.filter((a) => a !== frontAccount), ...(frontAccount ? [frontAccount] : [])]
  return (
    <div className="flex flex-col gap-1.5">
      <Kicker as="h2">{title}</Kicker>
      <ul aria-label={title} className="flex flex-col pt-1">
        {ordered.map((account, position) => {
          const tone = CARD_TONES[list.indexOf(account) % 3] ?? 'bg-forest text-cream'
          const isFront = account === frontAccount
          return (
            <AccountCard
              key={account.id}
              account={account}
              tone={tone}
              reserve={reserve.get(account.id)}
              front={isFront}
              first={position === 0}
              onSelect={(card) => (isFront || items.length === 1 ? onOpen(account, tone, card) : setFrontId(account.id))}
            />
          )
        })}
      </ul>
    </div>
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
    <section className="flex flex-col gap-2.5 px-[18px] pb-4 pt-1">
      <MentaHeader
        title="Medios de pago"
        subtitle={accounts.data ? `${list.length} ${list.length === 1 ? 'medio' : 'medios'}` : undefined}
        backTo={null}
        action={
          tab === 'medios' ? undefined : (
            <button
              type="button"
              onClick={tab === 'cuotas' ? () => setNewPurchase(true) : startCreating}
              aria-label={tab === 'cuotas' ? 'Nueva compra en cuotas' : 'Agregar tarjeta'}
              className={MENTA_CIRCLE}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </button>
          )
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
              {[
                { title: 'Cuentas y billeteras', items: list.filter((a) => !isCreditCard(a)) },
                { title: 'Tarjetas de crédito', items: list.filter(isCreditCard) },
              ]
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <CardStack
                    key={group.title}
                    title={group.title}
                    items={group.items}
                    list={list}
                    reserve={reserve}
                    onOpen={openDetail}
                  />
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
