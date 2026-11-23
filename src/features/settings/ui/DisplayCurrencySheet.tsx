import { Check } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CURRENCIES } from '@/shared/lib/currencies'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { useDisplayCurrency } from '@/shared/ui/displayCurrencyContext'

interface DisplayCurrencySheetProps {
  onClose: () => void
}

function matches(query: string, code: string, name: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return code.toLowerCase().includes(q) || name.toLowerCase().includes(q)
}

/** "Moneda de visualización": elegís una y toda la app convierte los montos (guardados en ARS) para mostrarlos así. */
export function DisplayCurrencySheet({ onClose }: DisplayCurrencySheetProps) {
  const { currency, setCurrency, ratesUpdatedAt, ratesStale } = useDisplayCurrency()
  const [query, setQuery] = useState('')

  const filtered = useMemo(
    () => CURRENCIES.filter((c) => matches(query, c.code, c.name)),
    [query],
  )

  return (
    <BottomSheet title="Moneda de visualización" onClose={onClose} variant="screen">
      <div className="flex flex-1 flex-col gap-3">
        <p className="text-[13px] text-text-muted">
          Tus gastos e ingresos se guardan siempre en pesos. Elegí otra moneda solo para verlos
          convertidos en toda la app — no cambia nada de lo que ya cargaste.
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar moneda…"
          aria-label="Buscar moneda"
          className="h-12 w-full rounded-[14px] border border-line bg-card px-4 text-[15px] text-ink placeholder:text-text-muted focus-visible:border-forest dark:focus-visible:border-lime"
        />
        {currency !== 'ARS' && (
          <p className="text-[12px] text-text-muted">
            {ratesUpdatedAt
              ? `Tasas actualizadas el ${new Date(ratesUpdatedAt).toLocaleDateString('es-AR')}${
                  ratesStale ? ' (sin conexión, puede estar desactualizada)' : ''
                }.`
              : 'Buscando la tasa de cambio…'}
          </p>
        )}
        <ul className="flex-1 divide-y divide-line overflow-y-auto">
          {filtered.map((c) => {
            const selected = c.code === currency
            return (
              <li key={c.code}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setCurrency(c.code)
                    onClose()
                  }}
                  className={cn(
                    'flex min-h-[54px] w-full items-center gap-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-ink',
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sand text-[13px] font-semibold text-forest dark:text-ink">
                    {c.symbol.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-[15px] font-medium text-ink">{c.code}</span>
                    <span className="block truncate text-[12px] text-text-muted">{c.name}</span>
                  </span>
                  {selected && (
                    <Check aria-hidden="true" className="size-5 shrink-0 text-forest dark:text-lime" strokeWidth={2.5} />
                  )}
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="py-6 text-center text-[14px] text-text-muted">No encontramos esa moneda.</li>
          )}
        </ul>
      </div>
    </BottomSheet>
  )
}
