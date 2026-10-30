import { useMemo, useRef, useState } from 'react'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { isCreditCard } from '@/features/accounts/domain/account'
import { useCategories } from '@/features/categories/api/useCategories'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { toUserMessage } from '@/shared/lib/errors'
import { argentinaTodayIso, isIsoDate } from '@/shared/lib/month'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { CategoryChip } from '@/shared/ui/CategoryChip'
import { getCategoryIcon } from '@/shared/ui/categoryIcons'
import { ChoiceChip, SectionLabel, Toggle } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateSubscription, useUpdateSubscription } from '../api/useSubscriptions'
import {
  CATEGORY_HINTS,
  CUSTOM_SERVICE_ID,
  findService,
  type CatalogService,
} from '../domain/catalog'
import type { Subscription, SubscriptionPeriod } from '../domain/subscription'
import { ServiceLogo } from './ServiceLogo'

const fieldClass =
  'h-14 w-full rounded-[18px] border border-sand bg-white px-4 text-[17px] text-forest placeholder:text-text-muted'

type Target =
  | { kind: 'catalog'; service: CatalogService }
  | { kind: 'custom'; name: string }
  | { kind: 'edit'; subscription: Subscription }

/**
 * Screen 075 — Nueva suscripción / Editar. Everything is in pesos (ARS): the person types what the bank
 * really charged; Moni does not convert currencies or add taxes. Edits apply to the next charges.
 */
export function SubscriptionFormSheet({
  target,
  onClose,
  onSaved,
}: {
  target: Target
  onClose: () => void
  onSaved?: () => void
}) {
  const toast = useToast()
  const accounts = useAccounts()
  const categories = useCategories('expense')
  const create = useCreateSubscription()
  const update = useUpdateSubscription()
  const requestKey = useRef(crypto.randomUUID())
  const saving = useRef(false)
  const today = argentinaTodayIso()

  const editing = target.kind === 'edit' ? target.subscription : null
  const service =
    target.kind === 'catalog'
      ? target.service
      : editing
        ? findService(editing.serviceId)
        : undefined
  const serviceId =
    target.kind === 'catalog' ? target.service.id : (editing?.serviceId ?? CUSTOM_SERVICE_ID)

  const accountList = useMemo(() => accounts.data ?? [], [accounts.data])
  const expenseCategories = useMemo(
    () => (categories.data ?? []).filter((c) => c.archivedAt === null),
    [categories.data],
  )

  const [name, setName] = useState(
    target.kind === 'custom' ? target.name : (editing?.name ?? service?.name ?? ''),
  )
  const [plan, setPlan] = useState(editing?.plan ?? '')
  const [text, setText] = useState(editing ? formatAmountInput(editing.amountCents) : '')
  const [period, setPeriod] = useState<SubscriptionPeriod>(editing?.period ?? 'monthly')
  const [nextOn, setNextOn] = useState(editing?.nextChargeOn ?? today)
  const [accountId, setAccountId] = useState(editing?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? '')
  const [remind, setRemind] = useState(editing?.remind ?? true)
  const [error, setError] = useState<string | null>(null)

  // Defaults once the lists arrive: the first account, and a category that suits the kind of service.
  const effectiveAccountId = accountId || accountList[0]?.id || ''
  const hintedCategory = useMemo(() => {
    const hints = service ? CATEGORY_HINTS[service.category] : CATEGORY_HINTS.memberships
    return expenseCategories.find((c) => hints.includes(c.name.toLowerCase()))?.id
  }, [service, expenseCategories])
  const effectiveCategoryId = categoryId || hintedCategory || ''

  const amountCents = parseAmountInput(text) ?? 0
  const valid =
    name.trim().length > 0 &&
    amountCents > 0 &&
    isIsoDate(nextOn) &&
    nextOn >= today &&
    effectiveAccountId !== '' &&
    effectiveCategoryId !== ''

  async function save() {
    if (!valid || saving.current) return
    saving.current = true
    setError(null)
    const input = {
      serviceId,
      name: name.trim(),
      plan: plan.trim() || null,
      amountCents,
      period,
      nextChargeOn: nextOn,
      accountId: effectiveAccountId,
      categoryId: effectiveCategoryId,
      remind,
    }
    try {
      if (editing) await update.mutateAsync({ id: editing.id, input })
      else await create.mutateAsync({ input, requestKey: requestKey.current })
      toast.show(editing ? `${input.name} actualizada` : `${input.name} agregada`)
      if (onSaved) onSaved()
      else onClose()
    } catch (e) {
      setError(toUserMessage(e))
      saving.current = false
    }
  }

  const busy = create.isPending || update.isPending

  return (
    <BottomSheet title={editing ? 'Editar suscripción' : 'Nueva suscripción'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <ServiceLogo serviceId={serviceId} size="lg" />
          {target.kind === 'custom' || serviceId === CUSTOM_SERVICE_ID ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Nombre"
              aria-label="Nombre de la suscripción"
              className={fieldClass}
            />
          ) : (
            <p className="font-display text-[24px] font-extrabold leading-7 text-forest">{name}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Plan</SectionLabel>
          {service?.plans && service.plans.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Planes habituales">
              {service.plans.map((p) => (
                <ChoiceChip
                  key={p}
                  selected={plan === p}
                  onClick={() => setPlan(plan === p ? '' : p)}
                >
                  {p}
                </ChoiceChip>
              ))}
            </div>
          )}
          <input
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            maxLength={40}
            placeholder={service?.plans?.length ? 'Otro plan (opcional)' : 'Plan (opcional)'}
            aria-label="Plan"
            className={fieldClass}
          />
          {service?.plans && service.plans.length > 0 && (
            <p className="text-[14px] leading-5 text-text-muted">
              Son los planes habituales; no incluyen precios.
            </p>
          )}
        </div>

        <div>
          <SectionLabel>Cuánto pagás en pesos</SectionLabel>
          <div className="flex items-end gap-2">
            <AmountInput
              aria-label="Monto en pesos"
              prefix="$"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-w-0 flex-1"
            />
            <span className="pb-3 text-[15px] text-text-muted">
              {period === 'monthly' ? 'por mes' : 'por año'}
            </span>
          </div>
          <p className="mt-1 text-[14px] leading-5 text-text-muted">
            Poné lo que te cobra el banco en pesos, con impuestos incluidos. Moni no convierte
            dólares ni calcula impuestos.
          </p>
        </div>

        <SegmentedControl
          label="Frecuencia"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'monthly', label: 'Mensual' },
            { value: 'yearly', label: 'Anual' },
          ]}
        />

        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Próximo cobro
            </span>
            <input
              type="date"
              value={nextOn}
              min={today}
              onChange={(e) => setNextOn(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
              Cuenta o tarjeta
            </span>
            <select
              value={effectiveAccountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={fieldClass}
            >
              {accountList.map((a) => (
                <option key={a.id} value={a.id}>
                  {isCreditCard(a) ? `${a.name} · Tarjeta` : a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
            Categoría del gasto
          </legend>
          <div className="flex flex-wrap gap-2">
            {expenseCategories.map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                icon={getCategoryIcon(c.icon)}
                color={c.color}
                selected={effectiveCategoryId === c.id}
                onClick={() => setCategoryId(c.id)}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-center gap-3 rounded-[18px] border border-sand bg-white px-4 py-3">
          <span className="flex-1">
            <span className="block text-[17px] font-extrabold">Avisarme antes del cobro</span>
            <span className="block text-[14px] text-text-muted">
              Un día antes, dentro de Moni (sin notificaciones push por ahora)
            </span>
          </span>
          <Toggle label="Avisarme antes del cobro" checked={remind} onChange={setRemind} />
        </div>

        {editing && (
          <p className="text-[14px] leading-5 text-text-muted">
            Los cambios valen para los próximos cobros. Los que ya se registraron no se modifican.
          </p>
        )}
        {error && (
          <p role="alert" className="text-center text-sm text-expense">
            {error}
          </p>
        )}
        <Button disabled={!valid || busy} onClick={() => void save()}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </BottomSheet>
  )
}
