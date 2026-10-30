import {
  Banknote,
  ChevronLeft,
  CreditCard,
  Landmark,
  Pencil,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import mascotHappy from '@/assets/mascot/expresion_feliz.svg'
import type { Category } from '@/features/categories/domain/category'
import { formatAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import type { AccountKind } from '@/shared/lib/database.types'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { AmountInput } from '@/shared/ui/AmountInput'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { SectionLabel } from '@/shared/ui/kit'
import { useModal } from '@/shared/ui/useModal'
import { useToast } from '@/shared/ui/toastContext'
import { useUpdateAccount } from '../api/useAccounts'
import {
  accountFormSchema,
  availableCredit,
  canHoldTransferData,
  isCreditCard,
  type Account,
} from '../domain/account'
import { brandForAccountName } from '../domain/bankCatalog'
import { skinForAccountName, skinStyle } from '../domain/cardSkins'
import { AdjustBalanceSection } from './AdjustBalanceSection'
import { BrandBadge, BrandCardArt } from './BrandCardArt'
import { BrandLogo } from './BrandLogo'
import { ClassifyOpeningSection } from './ClassifyOpeningSection'
import { TransferDataSection } from './TransferDataSection'

const KIND_ICONS: Record<AccountKind, LucideIcon> = {
  cash: Banknote,
  bank: Landmark,
  wallet: Wallet,
  credit_card: CreditCard,
}

const KIND_SUBTITLES: Record<AccountKind, string> = {
  cash: 'Billetes que tenés encima',
  bank: 'Banco',
  wallet: 'Billetera virtual',
  credit_card: 'Tarjeta de crédito',
}

const OPEN_MS = 380
const CLOSE_MS = 280
const EASE = 'cubic-bezier(0.2, 0.85, 0.25, 1)'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export interface AccountDetailProps {
  account: Account
  /** Tailwind classes of the card (the same colors it has in the list). */
  tone: string
  /** Where the card was in the list: the detail opens from there and closes back to there. */
  origin: { top: number; height: number }
  /** What the savings goals reserve in this account (virtual), when there is something. */
  reserve?: { reservedCents: number; freeCents: number }
  incomeCategories: readonly Category[]
  /** Deleting is only offered when it is not the last payment method. */
  canDelete: boolean
  canPayCard: boolean
  onClose: () => void
  onDelete: () => void
  onPayCard: () => void
}

/**
 * Opened from a card of "Medios de pago": the same card grows into a large one (it expands from where it was, and goes
 * back there when it closes) with only what matters under it: the name (Editar), the balance (Ajustar saldo) and, quietly,
 * Eliminar. The type of the medium is not editable here, so it cannot be changed by accident. With reduced motion the
 * detail simply appears.
 */
export function AccountDetail({
  account,
  tone,
  origin,
  reserve,
  incomeCategories,
  canDelete,
  canPayCard,
  onClose,
  onDelete,
  onPayCard,
}: AccountDetailProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const closing = useRef(false)
  const [mode, setMode] = useState<'view' | 'name' | 'balance' | 'transfer' | 'classify'>('view')

  const card = isCreditCard(account)
  const brand = brandForAccountName(account.name)
  // The identity of the entity, if it is one of the catalog; otherwise Moni's own colors (`tone`).
  const skin = skinForAccountName(account.name)
  const Icon = KIND_ICONS[account.kind]
  const credit = availableCredit(account)

  // Open: the card starts where it was in the list and settles into place; the rest of the detail rises in after it.
  useLayoutEffect(() => {
    const el = cardRef.current
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return
    const final = el.getBoundingClientRect()
    const dy = origin.top - final.top
    const opts = { duration: OPEN_MS, easing: EASE, fill: 'backwards' } as const
    // Only the background fades in: the card itself is solid from the first frame, so it reads as the same card moving.
    backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 160,
      fill: 'backwards',
    })
    el.animate(
      [
        { transform: `translateY(${dy}px)`, height: `${origin.height}px` },
        { transform: 'translateY(0)', height: `${final.height}px` },
      ],
      opts,
    )
    faceRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 220,
      delay: 120,
      fill: 'backwards',
    })
    bodyRef.current?.animate(
      [
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 300, delay: 200, easing: EASE, fill: 'backwards' },
    )
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function requestClose() {
    if (closing.current) return
    closing.current = true
    const el = cardRef.current
    if (!el || prefersReducedMotion() || typeof el.animate !== 'function') return onClose()
    const here = el.getBoundingClientRect()
    const dy = origin.top - here.top
    const opts = {
      duration: CLOSE_MS,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
      fill: 'forwards',
    } as const
    bodyRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })
    faceRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' })
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_MS,
      delay: 40,
      fill: 'forwards',
    })
    const run = el.animate(
      [
        { transform: 'translateY(0)', height: `${here.height}px` },
        { transform: `translateY(${dy}px)`, height: `${origin.height}px` },
      ],
      opts,
    )
    run.onfinish = () => onClose()
    run.oncancel = () => onClose()
  }

  useModal(panelRef, requestClose)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={account.name}
      tabIndex={-1}
      className="fixed inset-0 z-40 overflow-y-auto outline-none"
    >
      <div ref={backdropRef} aria-hidden="true" className="fixed inset-0 -z-10 bg-canvas" />
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-14">
        <button
          type="button"
          onClick={requestClose}
          aria-label="Volver"
          className="flex size-12 items-center justify-center rounded-full border border-sand bg-white text-forest"
        >
          <ChevronLeft aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </button>

        <div
          ref={cardRef}
          data-testid="account-hero"
          className={cn(
            'relative overflow-hidden rounded-[30px] shadow-[0_14px_34px_rgba(6,71,53,0.22)]',
            !skin && tone,
          )}
          style={skin ? skinStyle(skin) : undefined}
        >
          {skin ? (
            <BrandCardArt skin={skin} />
          ) : (
            <>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-10 size-52 rounded-full bg-white/15"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-20 right-8 size-52 rounded-full bg-white/15"
              />
            </>
          )}
          <div ref={faceRef} className="relative flex min-h-[210px] flex-col justify-between p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-display text-[30px] font-extrabold leading-9">
                  {account.name}
                </h2>
                <p className="text-[16px] opacity-80">
                  {KIND_SUBTITLES[account.kind]}
                  {account.closingDay && account.dueDay ? ` · cierra el ${account.closingDay}` : ''}
                </p>
              </div>
              {brand && skin ? (
                <BrandBadge brand={brand} skin={skin} size="lg" />
              ) : brand ? (
                <BrandLogo brand={brand} />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/30"
                >
                  <Icon className="size-6" strokeWidth={2} />
                </span>
              )}
            </div>
            <div className="mt-8">
              <p className="text-[15px] opacity-80">
                {card ? (account.balanceCents > 0 ? 'A favor' : 'Deuda') : 'Saldo'}
              </p>
              <AmountDisplay
                cents={card ? Math.abs(account.balanceCents) : account.balanceCents}
                className="block font-display text-[44px] font-extrabold leading-[50px]"
              />
              {card && credit !== null && (
                <p className="text-[15px]">
                  Disponible <AmountDisplay cents={credit} className="font-extrabold" />
                </p>
              )}
              {!card && reserve && reserve.reservedCents > 0 && (
                <p className="mt-1 text-[14px] font-extrabold">
                  Reservado para metas <AmountDisplay cents={reserve.reservedCents} /> ·{' '}
                  {reserve.freeCents < 0 ? '⚠ ' : ''}libre{' '}
                  <AmountDisplay cents={reserve.freeCents} />
                </p>
              )}
            </div>
          </div>
        </div>

        <div ref={bodyRef} className="flex flex-col gap-3">
          <NameBlock
            account={account}
            editing={mode === 'name'}
            onEdit={() => setMode('name')}
            onDone={() => setMode('view')}
          />

          <section className="rounded-[24px] border border-sand bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel>{card ? 'Deuda actual' : 'Saldo actual'}</SectionLabel>
                <AmountDisplay
                  cents={card ? Math.abs(account.balanceCents) : account.balanceCents}
                  className="block font-display text-[26px] font-extrabold leading-8"
                />
              </div>
              {mode !== 'balance' && (
                <button
                  type="button"
                  onClick={() => setMode('balance')}
                  className="min-h-11 shrink-0 rounded-full bg-sand px-4 text-[16px] font-extrabold"
                >
                  {card ? 'Ajustar deuda' : 'Ajustar saldo'}
                </button>
              )}
            </div>
            {mode === 'balance' && (
              <div className="mt-3 flex flex-col gap-2">
                <AdjustBalanceSection account={account} onDone={() => setMode('view')} />
                <Button variant="ghost" onClick={() => setMode('view')}>
                  Cancelar
                </Button>
              </div>
            )}
          </section>

          {canHoldTransferData(account) && (
            <TransferDataSection
              account={account}
              editing={mode === 'transfer'}
              onEdit={() => setMode('transfer')}
              onDone={() => setMode('view')}
            />
          )}

          {!card && account.openingBalanceCents > 0 && (
            <section className="rounded-[24px] border border-sand bg-white p-4">
              {mode === 'classify' ? (
                <div className="flex flex-col gap-2">
                  <ClassifyOpeningSection
                    account={account}
                    incomeCategories={incomeCategories}
                    onDone={() => setMode('view')}
                  />
                  <Button variant="ghost" onClick={() => setMode('view')}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setMode('classify')}
                  className="min-h-11 w-full text-left text-[16px] font-extrabold"
                >
                  Clasificar saldo inicial
                  <span className="block text-[14px] font-normal text-text-muted">
                    Contanos de dónde vienen los {formatAmountInput(account.openingBalanceCents)}{' '}
                    con los que arrancó.
                  </span>
                </button>
              )}
            </section>
          )}

          {card && (
            <div className="flex flex-col gap-2">
              <Link
                to="/tarjetas"
                className="flex min-h-12 items-center justify-center rounded-full border-2 border-sand bg-white px-4 text-[16px] font-extrabold"
              >
                Ver resumen y cuotas
              </Link>
              {canPayCard && (
                <Button variant="dark" onClick={onPayCard}>
                  Pagar tarjeta
                </Button>
              )}
            </div>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="mx-auto mt-2 min-h-11 px-4 text-[15px] font-bold text-expense hover:underline"
            >
              Eliminar medio de pago
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** The name of the medium (and, for a card, its limit and closing / due days) with "Editar"; Guardar / Cancelar only while editing. */
function NameBlock({
  account,
  editing,
  onEdit,
  onDone,
}: {
  account: Account
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const update = useUpdateAccount()
  const card = isCreditCard(account)
  const [name, setName] = useState(account.name)
  const [limit, setLimit] = useState(
    account.creditLimitCents ? formatAmountInput(account.creditLimitCents) : '',
  )
  const [closingDay, setClosingDay] = useState(account.closingDay ? String(account.closingDay) : '')
  const [dueDay, setDueDay] = useState(account.dueDay ? String(account.dueDay) : '')
  const [error, setError] = useState<string | null>(null)

  function startEditing() {
    setName(account.name)
    setLimit(account.creditLimitCents ? formatAmountInput(account.creditLimitCents) : '')
    setClosingDay(account.closingDay ? String(account.closingDay) : '')
    setDueDay(account.dueDay ? String(account.dueDay) : '')
    setError(null)
    onEdit()
  }

  async function save() {
    setError(null)
    // The type and the starting balance are sent exactly as they are: only the name (and a card's settings) can change here.
    const result = accountFormSchema.safeParse({
      name,
      kind: account.kind,
      openingBalance: formatAmountInput(Math.abs(account.openingBalanceCents)),
      creditLimit: card ? limit : '',
      closingDay: card ? closingDay : '',
      dueDay: card ? dueDay : '',
    })
    if (!result.success) return setError(result.error.issues[0]?.message ?? 'Revisá los datos.')
    try {
      await update.mutateAsync({ id: account.id, values: result.data, previousKind: account.kind })
      toast.show('Medio actualizado', { mascotUrl: mascotHappy })
      onDone()
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  if (!editing) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-[24px] border border-sand bg-white p-4">
        <div className="min-w-0">
          <SectionLabel>Nombre</SectionLabel>
          <p className="break-words text-[20px] font-extrabold leading-7">{account.name}</p>
        </div>
        <button
          type="button"
          onClick={startEditing}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-sand px-4 text-[16px] font-extrabold"
        >
          <Pencil aria-hidden="true" className="size-4" /> Editar
        </button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-[24px] border-2 border-forest bg-white p-4">
      <label className="flex flex-col gap-1">
        <SectionLabel>Nombre</SectionLabel>
        <input
          type="text"
          data-autofocus
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nombre del medio de pago"
          className="h-14 w-full rounded-[18px] border border-sand bg-canvas px-4 text-[18px] font-extrabold text-forest"
        />
      </label>
      {card && (
        <>
          <div>
            <SectionLabel>Límite de crédito</SectionLabel>
            <AmountInput
              scale="md"
              aria-label="Límite de crédito"
              placeholder="Sin límite"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            {[
              ['Día de cierre', closingDay, setClosingDay],
              ['Día de vencimiento', dueDay, setDueDay],
            ].map(([label, value, set]) => (
              <label key={label as string} className="flex min-w-0 flex-col justify-end gap-1">
                <SectionLabel>{label as string}</SectionLabel>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  placeholder="Ej: 25"
                  aria-label={label as string}
                  value={value as string}
                  onChange={(e) => (set as (v: string) => void)(e.target.value)}
                  className="h-14 w-full min-w-0 rounded-[18px] border border-sand bg-canvas px-4 text-[17px] text-forest"
                />
              </label>
            ))}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-expense">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          onClick={onDone}
          disabled={update.isPending}
          className="border-2 border-sand"
        >
          Cancelar
        </Button>
        <Button variant="dark" onClick={() => void save()} disabled={update.isPending}>
          {update.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </section>
  )
}
