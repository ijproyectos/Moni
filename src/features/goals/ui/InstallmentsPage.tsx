import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useLocation } from 'react-router'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { formatArs } from '@/shared/lib/money'
import { AmountInput } from '@/shared/ui/AmountInput'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { CheckDot, ChoiceChip, DashedButton, MoniGlyph, Page, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import {
  analyzeInstallments,
  validateInstallmentInput,
  type InstallmentAnalysis,
} from '@/features/budgets/domain/installments'
import { formatRate, optionTotal, roundUpSuggestion, type InstallmentOption } from '../domain/goals'
import { MOCK_AGUINALDO_ESTIMATE } from '../mock/goalsStore'
import { NewGoalSheet, type NewGoalPrefill } from './NewGoalSheet'

const AGUINALDO_MONTHS = 3

const DEFAULT_INFLATION_PERCENT = 3

/** "3,5" or "3.5" -> 3.5; null when it is not a number. */
function parsePercent(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) ? value : null
}

/** Analysis of an installments option, or null while the inputs are not valid. */
function analyze(
  price: number,
  option: InstallmentOption,
  inflation: number | null,
  discount: number | null,
): InstallmentAnalysis | null {
  if (option.kind !== 'installments' || inflation === null || discount === null) return null
  const input = {
    cashPriceCents: price,
    installments: option.count,
    installmentCents: option.installmentCents,
    monthlyInflationPercent: inflation,
    cashDiscountPercent: discount,
  }
  return validateInstallmentInput(input) ? null : analyzeInstallments(input)
}

// No preset offers: the person types the installment plans they were actually quoted.
const DEFAULT_OPTIONS: InstallmentOption[] = []

// Screens 030 / 031 — ¿Conviene en cuotas?
export function InstallmentsPage() {
  const state = (useLocation().state ?? {}) as { name?: string; amountCents?: number }
  const name = state.name ?? 'Tu compra'
  const [price, setPrice] = useState(state.amountCents ?? 0)
  const [aguinaldo, setAguinaldo] = useState(MOCK_AGUINALDO_ESTIMATE)
  const [editing, setEditing] = useState<null | 'price' | 'aguinaldo'>(null)
  const [options, setOptions] = useState(DEFAULT_OPTIONS)
  const [selectedId, setSelectedId] = useState('')
  const [adding, setAdding] = useState(false)
  const [prefill, setPrefill] = useState<NewGoalPrefill | null>(null)
  const [inflationText, setInflationText] = useState(String(DEFAULT_INFLATION_PERCENT))
  const [discountText, setDiscountText] = useState('')
  const inflation = parsePercent(inflationText)
  const discount = discountText.trim() === '' ? 0 : parsePercent(discountText)

  const installments = options.filter((o) => o.kind === 'installments')
  const selected = options.find((o) => o.id === selectedId) ?? options[0] ?? null
  const extra = (o: InstallmentOption) => optionTotal(o, price) - price
  const cheapest = installments.reduce<InstallmentOption | null>(
    (best, o) => (!best || extra(o) < extra(best) ? o : best),
    null,
  )
  const compareAgainst = selected?.kind === 'installments' ? selected : cheapest
  const saving = compareAgainst ? extra(compareAgainst) : 0
  const analysis = selected ? analyze(price, selected, inflation, discount) : null
  const aguinaldoMonthly = roundUpSuggestion(Math.max(0, price - aguinaldo) / AGUINALDO_MONTHS)

  return (
    <Page className="pb-6">
      <PageHeader title="¿Conviene en cuotas?" />
      <div className="rounded-[24px] border border-sand bg-card p-4">
        <div className="flex justify-between text-[16px]">
          <span className="font-extrabold">{name}</span>
          <span className="text-text-muted">Precio de contado</span>
        </div>
        {editing === 'price' ? (
          <AmountInput
            autoFocus
            aria-label="Precio de contado"
            defaultValue={formatAmountInput(price)}
            onBlur={(e) => {
              const typed = parseAmountInput(e.target.value)
              setPrice(typed && typed > 0 ? typed : price)
              setEditing(null)
            }}
          />
        ) : (
          <div className="flex items-center justify-between">
            <p className="font-display text-[44px] font-extrabold">
              <span className="mr-1 text-[30px]">$</span>
              {formatArs(price).slice(1)}
            </p>
            <button
              type="button"
              aria-label="Editar precio"
              onClick={() => setEditing('price')}
              className="p-2"
            >
              <Pencil aria-hidden="true" className="size-5" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PercentField
          label="Inflación esperada por mes"
          hint="Editable. Es tu estimación."
          value={inflationText}
          onChange={setInflationText}
          invalid={inflation === null || inflation < 0 || inflation > 100}
        />
        <PercentField
          label="Descuento por pagar de contado"
          hint="Opcional."
          value={discountText}
          onChange={setDiscountText}
          placeholder="0"
          invalid={discount === null || discount < 0 || discount >= 100}
        />
      </div>

      <SectionLabel
        action={
          editing === 'aguinaldo' ? (
            <input
              autoFocus
              aria-label="Aguinaldo estimado"
              defaultValue={formatAmountInput(aguinaldo)}
              onBlur={(e) => {
                setAguinaldo(parseAmountInput(e.target.value) ?? aguinaldo)
                setEditing(null)
              }}
              className="w-32 rounded-full border border-sand bg-card px-3 py-1 text-right text-[15px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing('aguinaldo')}
              className="flex items-center gap-1 text-[15px] font-bold"
            >
              Aguinaldo est. {formatArs(aguinaldo)}
              <Pencil aria-hidden="true" className="size-4" />
            </button>
          )
        }
      >
        Comparar
      </SectionLabel>

      <ul
        role="radiogroup"
        aria-label="Opciones"
        className="flex flex-col gap-1 rounded-[24px] border border-sand bg-card p-2"
      >
        {options.map((o) => {
          const active = o.id === selected?.id
          const isAgui = o.kind === 'aguinaldo'
          return (
            <li key={o.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedId(o.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[18px] border-2 px-3 py-2.5 text-left',
                  active ? 'border-ink' : 'border-transparent',
                )}
              >
                <CheckDot checked={active} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-extrabold leading-6">
                    {isAgui
                      ? 'Aguinaldo + ahorro'
                      : `${o.count} cuotas de ${formatArs(o.installmentCents)}`}
                  </span>
                  <span className="block text-[14px] leading-5 text-text-muted">
                    {isAgui
                      ? `Aguinaldo + ${formatArs(aguinaldoMonthly)} por mes · ${AGUINALDO_MONTHS} meses`
                      : `+${formatArs(extra(o))} · ${formatRate(optionRate(price, o))} por mes`}
                  </span>
                </span>
                <span className="text-[16px] font-extrabold">
                  {formatArs(optionTotal(o, price))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <DashedButton onClick={() => setAdding(true)}>
        <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
        Agregar otra opción
      </DashedButton>

      <section className="rounded-[24px] bg-forest p-5 text-cream">
        <p className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
          <MoniGlyph className="size-5 text-gold" /> Comparación de Moni
        </p>
        {analysis ? (
          <>
            <p className="mt-2 font-display text-[26px] font-extrabold leading-8 text-lime">
              {VERDICT_TITLE[analysis.verdict]}
            </p>
            <div className="mt-2 flex flex-col gap-2 text-[16px] leading-6 text-text-muted-on-dark">
              {analysis.explanation.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </>
        ) : selected?.kind === 'aguinaldo' ? (
          <>
            <p className="mt-2 font-display text-[26px] font-extrabold leading-8 text-lime">
              Con el aguinaldo ahorrás {formatArs(saving)}
            </p>
            <p className="mt-2 text-[16px] leading-6 text-text-muted-on-dark">
              Si esperás a diciembre y lo pagás de contado, no pagás interés.
            </p>
          </>
        ) : !selected ? (
          <p className="mt-2 text-[16px] leading-6 text-text-muted-on-dark">
            Cargá el precio de contado y agregá las cuotas que te ofrecen para compararlas.
          </p>
        ) : (
          <p className="mt-2 text-[16px] leading-6 text-text-muted-on-dark">
            Revisá la inflación y el descuento: tienen que ser porcentajes válidos para comparar.
          </p>
        )}
        {cheapest && (
          <p className="mt-3 border-t border-white/15 pt-3 text-[16px] leading-6 text-text-muted-on-dark">
            Si lo necesitás ya, la opción con menos interés es la de {cheapest.count} cuotas (+
            {formatArs(extra(cheapest))}).
          </p>
        )}
      </section>

      <Button
        onClick={() =>
          setPrefill({
            name,
            amountCents: price,
            months: AGUINALDO_MONTHS,
            comparedSavingCents: saving,
            comparedCount: compareAgainst?.count,
          })
        }
      >
        <MoniGlyph className="mr-2" /> Crear meta con esto
      </Button>

      {adding && (
        <AddOptionSheet
          price={price}
          onClose={() => setAdding(false)}
          onAdd={(o) => {
            setOptions((list) => [
              ...list.filter((x) => x.kind === 'installments'),
              o,
              ...list.filter((x) => x.kind === 'aguinaldo'),
            ])
            setSelectedId(o.id)
            setAdding(false)
          }}
        />
      )}
      {prefill && <NewGoalSheet prefill={prefill} onClose={() => setPrefill(null)} />}
    </Page>
  )
}

const VERDICT_TITLE = {
  cuotas: 'Te conviene en cuotas',
  contado: 'Te conviene pagar de contado',
  similar: 'Da casi lo mismo',
} as const

/** Monthly implied rate (CFT-like) of an installments option against the cash price. */
function optionRate(price: number, option: InstallmentOption): number {
  const input = {
    cashPriceCents: price,
    installments: option.count,
    installmentCents: option.installmentCents,
    monthlyInflationPercent: 0,
  }
  if (validateInstallmentInput(input)) return 0
  return Math.max(0, analyzeInstallments(input).impliedMonthlyRate)
}

function PercentField({
  label,
  hint,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid: boolean
}) {
  return (
    <label className="flex flex-col gap-1 rounded-[18px] border border-sand bg-card px-3 py-2">
      <span className="text-[14px] font-extrabold leading-5">{label}</span>
      <span className="flex items-baseline gap-1 text-[22px] font-extrabold">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid}
          className={cn('w-full min-w-0 bg-transparent outline-none', invalid && 'text-expense')}
        />
        %
      </span>
      <span className="text-[13px] text-text-muted">{hint}</span>
    </label>
  )
}

const COUNTS = [3, 6, 9, 12, 18, 24]

function AddOptionSheet({
  price,
  onClose,
  onAdd,
}: {
  price: number
  onClose: () => void
  onAdd: (o: InstallmentOption) => void
}) {
  const [count, setCount] = useState(18)
  const [text, setText] = useState(formatAmountInput(roundUpSuggestion((price * 1.5) / 18)))
  const installment = parseAmountInput(text) ?? 0
  const total = count * installment
  const extra = total - price
  return (
    <BottomSheet title="Agregar opción" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SectionLabel>¿Cuántas cuotas?</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {COUNTS.map((c) => (
            <ChoiceChip
              key={c}
              selected={c === count}
              onClick={() => setCount(c)}
              className="size-12 px-0"
            >
              {c}
            </ChoiceChip>
          ))}
        </div>
        <p className="flex items-baseline gap-3 border-b-2 border-sand pb-1">
          <span className="font-display text-[44px] font-extrabold">{count}</span>
          <span className="text-[17px] text-text-muted">cuotas</span>
        </p>
        <SectionLabel className="mt-1">¿De cuánto es cada cuota?</SectionLabel>
        <AmountInput
          aria-label="Monto de la cuota"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {installment > 0 && (
          <div className="rounded-[22px] bg-forest p-4 text-cream">
            <p className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
              Moni calcula
            </p>
            <p className="mt-1 flex justify-between text-[17px]">
              <span>Total en cuotas</span>
              <strong className="font-extrabold">{formatArs(total)}</strong>
            </p>
            <p className="flex justify-between text-[17px]">
              <span>Pagás de más</span>
              <strong className="font-extrabold text-lime">{formatArs(Math.max(0, extra))}</strong>
            </p>
            <p className="mt-1 text-[14px] text-text-muted-on-dark">
              {Math.round((extra / price) * 100)}% más que de contado · unos{' '}
              {formatRate(
                optionRate(price, {
                  id: 'tmp',
                  kind: 'installments',
                  count,
                  installmentCents: installment,
                }),
              )}{' '}
              por mes
            </p>
          </div>
        )}
        <Button
          disabled={installment <= 0}
          onClick={() =>
            onAdd({
              id: `o${count}-${installment}`,
              kind: 'installments',
              count,
              installmentCents: installment,
            })
          }
        >
          Agregar a la comparación
        </Button>
      </div>
    </BottomSheet>
  )
}
