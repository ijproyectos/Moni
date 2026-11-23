import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import mascotAssistant from '@/assets/mascot/expresion_feliz.svg'
import { toUserMessage } from '@/shared/lib/errors'
import { formatRelativeDay } from '@/shared/lib/dates'
import { todayIso } from '@/shared/lib/month'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Page } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useSecondaryCurrency } from '@/features/settings/api/useSecondaryCurrency'
import { useAhorros, useVoidAhorro } from '../api/useAhorros'
import {
  KIND_LABELS,
  visibleCurrencies,
  balanceOf,
  formatSaving,
  type AhorroCurrency,
  type AhorroEntry,
  type AhorroKind,
} from '../domain/ahorros'
import { AhorroSheet } from './AhorroSheet'

type Sheet = { kind: AhorroKind; currency: AhorroCurrency } | null

/**
 * Ahorros: what the person has saved in pesos and in dollars, each on its own. No goal, no target. It is not income or spending and
 * it never adds to the money of the accounts; money set aside from an account stays reserved in it (never counted twice).
 */
export function AhorrosPage() {
  const toast = useToast()
  const ahorros = useAhorros()
  const voidEntry = useVoidAhorro()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [pending, setPending] = useState<AhorroEntry | null>(null)
  const entries = ahorros.data ?? []
  const { usesUsd } = useSecondaryCurrency()
  const currencies = visibleCurrencies(usesUsd, entries)
  const posted = entries.filter((e) => e.status === 'posted')
  const today = todayIso()

  async function confirmVoid() {
    if (!pending) return
    try {
      await voidEntry.mutateAsync(pending.id)
      toast.show('Movimiento eliminado')
      setPending(null)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
      setPending(null)
    }
  }

  return (
    <Page>
      <PageHeader title="Ahorros" fallbackTo="/mas" />
      {ahorros.isLoading ? (
        <div role="status" aria-label="Cargando ahorros" className="flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : ahorros.isError ? (
        <EmptyState
          mascotUrl={mascotAssistant}
          title="No pudimos cargar tus ahorros"
          description="Revisá tu conexión y probá de nuevo."
          action={<Button onClick={() => void ahorros.refetch()}>Reintentar</Button>}
        />
      ) : (
        <>
          <section aria-label="Lo que tenés ahorrado" className="flex flex-col gap-4">
            {currencies.map(({ code, label }) => {
              const balance = balanceOf(entries, code)
              const history = posted.filter((e) => e.currency === code)
              return (
                <article key={code} aria-label={`${label} (${code})`} className="rounded-[26px] bg-card p-4">
                  <p className="flex items-center gap-2 text-[15px] font-extrabold">
                    <span aria-hidden="true" className="text-[22px] leading-none">{code === 'ARS' ? '🇦🇷' : '🇺🇸'}</span>
                    {label} ({code})
                  </p>
                  <p className="mt-2 font-display text-[34px] font-extrabold leading-none tracking-[-0.02em]">
                    {formatSaving(balance, code)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: 'deposit', currency: code })}
                      aria-label={`Agregar ahorro en ${label.toLowerCase()}`}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-forest text-[15px] font-extrabold text-cream"
                    >
                      <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} /> Agregar
                    </button>
                    <button
                      type="button"
                      disabled={balance <= 0}
                      onClick={() => setSheet({ kind: 'withdrawal', currency: code })}
                      aria-label={`Retirar ahorro en ${label.toLowerCase()}`}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full border-2 border-line text-[15px] font-extrabold disabled:opacity-50"
                    >
                      <Minus aria-hidden="true" className="size-4" strokeWidth={2.5} /> Retirar
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheet({ kind: 'opening', currency: code })}
                    className="mt-1 min-h-11 text-[14px] font-extrabold underline"
                  >
                    Cargar lo que ya tenía
                  </button>
                  <h3 className="mt-2 text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">Historial</h3>
                  {history.length === 0 ? (
                    <p className="py-2 text-[14px] text-text-muted">Sin movimientos</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {history.map((e) => (
                        <li key={e.id} className="flex min-h-[56px] items-center gap-3 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">
                              {KIND_LABELS[e.kind]}
                              {e.note ? ` · ${e.note}` : ''}
                            </span>
                            <span className="block text-[13px] text-text-muted">{formatRelativeDay(e.occurredOn, today)}</span>
                          </span>
                          <span className={e.kind === 'withdrawal' ? 'font-bold text-expense' : 'font-bold text-income'}>
                            {e.kind === 'withdrawal' ? '-' : '+'}
                            {formatSaving(e.amountCents, e.currency)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPending(e)}
                            aria-label={`Eliminar ${KIND_LABELS[e.kind].toLowerCase()} de ${formatSaving(e.amountCents, e.currency)}`}
                            className="min-h-11 rounded-full px-2 text-[13px] font-extrabold text-text-muted"
                          >
                            Eliminar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              )
            })}
          </section>
        </>
      )}

      {sheet && <AhorroSheet kind={sheet.kind} currency={sheet.currency} onClose={() => setSheet(null)} />}
      {pending && (
        <ConfirmDialog
          title="¿Eliminar este movimiento?"
          message="Se descuenta de tus ahorros. No toca tus cuentas ni tus movimientos."
          confirmLabel="Eliminar"
          isBusy={voidEntry.isPending}
          onConfirm={() => void confirmVoid()}
          onCancel={() => setPending(null)}
        />
      )}
    </Page>
  )
}
