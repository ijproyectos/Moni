import { Minus, Plus } from 'lucide-react'
import { useMemo, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { formatAmountInput, parseAmountInput } from '@/shared/lib/amountInput'
import { withAmountFormatting } from '@/shared/ui/amountField'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { cn } from '@/shared/ui/cn'
import { FOCUS_RING } from '@/shared/ui/focusRing'
import { Kicker } from '@/shared/ui/Kicker'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import {
  DEFAULT_MONTHLY_INFLATION_PERCENT,
  INFLATION_STEP,
  INSTALLMENT_OPTIONS,
  MAX_INFLATION_PERCENT,
  defaultInstallmentTotal,
  simulate,
  type InstallmentOption,
  type SimulatorResult,
} from '../domain/simulator'

function formatPercent(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

/** Reads "2,5" or "2.5"; null when it is not a number. */
function parsePercent(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(value) ? value : null
}

function Row({
  label,
  hint,
  last,
  children,
}: {
  label: string
  hint?: ReactNode
  last?: boolean
  children: ReactNode
}) {
  return (
    <div className={cn('grid grid-cols-[1fr_150px] items-center gap-2.5 py-1.5', !last && 'border-b border-line')}>
      <div>
        <div className="text-[14px] text-[#4F6157] dark:text-text-muted">{label}</div>
        {hint && <div className="text-[12px] text-placeholder">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

/** Field of the design: 40px, canvas fill, 12px radius; the focus ring wraps the whole box. */
function Field({
  prefix,
  suffix,
  ...input
}: { prefix?: string; suffix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex h-10 min-w-0 items-center rounded-[12px] bg-canvas px-3 text-[16px] font-medium text-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-mint-ink">
      {prefix && <span aria-hidden="true">{prefix}</span>}
      <input
        {...input}
        className="min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-text-muted"
      />
      {suffix && <span aria-hidden="true">{suffix}</span>}
    </label>
  )
}

function Verdict({ result }: { result: SimulatorResult }) {
  const title =
    result.verdict === 'contado'
      ? 'Conviene contado'
      : result.verdict === 'cuotas'
        ? 'Conviene en cuotas'
        : 'Da casi lo mismo'
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl bg-ok-bg px-3.5 py-3">
      <div>
        <div className="text-[16px] font-bold text-ok-ink">{title}</div>
        <div className="text-[13px] text-ok-ink">
          {result.verdict === 'similar' ? 'La diferencia es de ' : 'Ahorrás '}
          <AmountDisplay cents={result.savingsCents} /> en pesos de hoy
        </div>
      </div>
    </div>
  )
}

/** Cuotas vs contado (screen 04): everything is computed on the device from the numbers typed here. */
export function InstallmentSimulatorPage() {
  const [priceText, setPriceText] = useState('')
  const [discountText, setDiscountText] = useState('')
  const [count, setCount] = useState<InstallmentOption>(6)
  const [installmentText, setInstallmentText] = useState<string | null>(null)
  const [inflationText, setInflationText] = useState(formatPercent(DEFAULT_MONTHLY_INFLATION_PERCENT))

  const cashPrice = parseAmountInput(priceText)
  const discount = discountText.trim() === '' ? 0 : parsePercent(discountText)
  const inflation = parsePercent(inflationText)
  // The price in cuotas follows the cash price until the person types their own.
  const derivedTotal = cashPrice !== null ? defaultInstallmentTotal(cashPrice) : null
  const installmentTotal = installmentText === null ? derivedTotal : parseAmountInput(installmentText)

  const result = useMemo(
    () =>
      cashPrice !== null && installmentTotal !== null && discount !== null && inflation !== null
        ? simulate({
            cashPriceCents: cashPrice,
            discountPercent: discount,
            count,
            installmentTotalCents: installmentTotal,
            monthlyInflationPercent: inflation,
          })
        : null,
    [cashPrice, installmentTotal, discount, inflation, count],
  )

  function stepInflation(delta: number) {
    const current = inflation ?? DEFAULT_MONTHLY_INFLATION_PERCENT
    const next = Math.min(MAX_INFLATION_PERCENT, Math.max(0, Math.round((current + delta) * 10) / 10))
    setInflationText(formatPercent(next))
  }

  const stepButton = cn(
    'flex size-9 items-center justify-center text-[#4F6157] dark:text-text-muted',
    FOCUS_RING,
  )

  return (
    <section className="flex flex-col gap-2.5 px-[18px] pb-5 pt-1">
      <MentaHeader title="Cuotas vs contado" subtitle="Simulación" backTo="/cuentas?tab=tarjetas" />

      <div className="rounded-[28px] bg-card px-4 py-1.5">
        <Row label="Precio contado">
          <Field
            prefix="$"
            aria-label="Precio contado"
            inputMode="decimal"
            placeholder="0"
            value={priceText}
            onChange={withAmountFormatting((e) => setPriceText(e.target.value))}
          />
        </Row>
        <Row label="Descuento efectivo o transferencia">
          <Field
            suffix="%"
            aria-label="Descuento en porcentaje"
            inputMode="decimal"
            placeholder="0"
            value={discountText}
            onChange={(e) => setDiscountText(e.target.value)}
          />
        </Row>
        <Row label="Cuotas">
          <SegmentedControl
            label="Cantidad de cuotas"
            variant="menta"
            value={String(count) as `${InstallmentOption}`}
            onChange={(v) => setCount(Number(v) as InstallmentOption)}
            options={INSTALLMENT_OPTIONS.map((n) => ({ value: String(n) as `${InstallmentOption}`, label: String(n) }))}
            className="h-10 !rounded-[12px] !bg-canvas p-[3px] [&>button]:!rounded-[9px] [&>button]:!py-0 [&>button]:text-[14.5px] [&>button]:font-medium"
          />
        </Row>
        <Row
          label="Precio en cuotas"
          hint={
            installmentTotal !== null && installmentTotal > 0 ? (
              <>
                {count} × <AmountDisplay cents={Math.round(installmentTotal / count)} />
                {installmentText === null && ' · igual al contado'}
              </>
            ) : undefined
          }
        >
          <Field
            prefix="$"
            aria-label="Precio en cuotas"
            inputMode="decimal"
            placeholder="0"
            value={installmentText ?? (derivedTotal !== null ? formatAmountInput(derivedTotal) : '')}
            onChange={withAmountFormatting((e) => setInstallmentText(e.target.value))}
          />
        </Row>
        <Row label="Inflación mensual" hint="Estimada · editable" last>
          <div className="grid h-10 grid-cols-[36px_1fr_36px] items-center rounded-[12px] bg-canvas text-center">
            <button type="button" aria-label="Bajar la inflación" onClick={() => stepInflation(-INFLATION_STEP)} className={stepButton}>
              <Minus aria-hidden="true" className="mx-auto size-4" strokeWidth={2.2} />
            </button>
            <span className="flex items-center justify-center">
              <input
                aria-label="Inflación mensual en porcentaje"
                inputMode="decimal"
                value={inflationText}
                onChange={(e) => setInflationText(e.target.value.replace('%', ''))}
                className={cn('w-12 bg-transparent text-right text-[16px] font-medium text-ink', FOCUS_RING)}
              />
              <span className="text-[16px] font-medium">%</span>
            </span>
            <button type="button" aria-label="Subir la inflación" onClick={() => stepInflation(INFLATION_STEP)} className={stepButton}>
              <Plus aria-hidden="true" className="mx-auto size-4" strokeWidth={2.2} />
            </button>
          </div>
        </Row>
      </div>

      <section aria-label="Resultado" className="flex flex-col gap-2.5 rounded-[28px] bg-card px-4 py-3.5">
        <Kicker as="h2" className="font-medium">
          Costo real en pesos de hoy
        </Kicker>
        {result === null ? (
          <p className="text-[13.5px] text-text-muted">
            Cargá el precio de contado y el precio en cuotas para compararlos.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[14px]">
                <span className="font-medium">
                  {discount && discount > 0 ? `Contado con ${formatPercent(discount)}% off` : 'Contado'}
                </span>
                <AmountDisplay cents={result.cashPayCents} className="font-semibold" />
              </div>
              <span
                role="img"
                aria-label={`Contado ${Math.round(result.cashBar * 100)}% del costo más alto`}
                className="h-3.5 rounded-full bg-mint"
                style={{ width: `${Math.max(2, result.cashBar * 100)}%` }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[14px]">
                <span className="font-medium">{count} cuotas</span>
                <AmountDisplay cents={result.presentValueCents} className="font-semibold" />
              </div>
              <span
                role="img"
                aria-label={`Cuotas ${Math.round(result.installmentsBar * 100)}% del costo más alto`}
                className="h-3.5 rounded-full bg-[#CDEBD9] dark:bg-mint-soft"
                style={{ width: `${Math.max(2, result.installmentsBar * 100)}%` }}
              />
              <span className="text-[12px] text-text-muted">
                Pagás <AmountDisplay cents={result.installmentTotalCents} />
                {inflation !== null && inflation > 0 ? (
                  <>
                    , pero con {formatPercent(inflation)}% mensual equivalen a{' '}
                    <AmountDisplay cents={result.presentValueCents} /> de hoy.
                  </>
                ) : (
                  <>, sin inflación valen lo mismo que hoy.</>
                )}
              </span>
            </div>
            <Verdict result={result} />
            <p className="text-[12.5px] text-[#4F6157] dark:text-text-muted">
              {result.breakEvenPercent === null
                ? 'Las cuotas convienen con cualquier inflación: sumadas no cuestan más que el contado.'
                : `Las cuotas empiezan a convenir si la inflación supera ${formatPercent(result.breakEvenPercent)}% mensual.`}
            </p>
          </>
        )}
      </section>
    </section>
  )
}
