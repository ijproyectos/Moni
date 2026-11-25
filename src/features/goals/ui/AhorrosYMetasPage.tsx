import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  balanceOf,
  formatSaving,
  visibleCurrencies,
  type AhorroCurrency,
  type AhorroKind,
} from '@/features/ahorros/domain/ahorros'
import { useAhorros } from '@/features/ahorros/api/useAhorros'
import { AhorroSheet } from '@/features/ahorros/ui/AhorroSheet'
import { useSecondaryCurrency } from '@/features/settings/api/useSecondaryCurrency'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { MentaHeader } from '@/shared/ui/MentaHeader'
import { MENTA_CIRCLE } from '@/shared/ui/mentaStyles'
import { Skeleton } from '@/shared/ui/Skeleton'
import { todayIso } from '@/shared/lib/month'
import mascotAssistant from '@/assets/mascot/personaje_metas-de-ahorro.svg'
import { useSavings } from '../api/useSavings'
import { goalsByStatus } from '../domain/savings'
import { GoalRingCard } from './GoalRingCard'
import { NewGoalSheet } from './NewGoalSheet'

type Sheet = { kind: AhorroKind; currency: AhorroCurrency } | null

/**
 * Explorar entra acá: resume Ahorros (saldo por moneda) arriba y Metas de ahorro (las activas) abajo, cada uno
 * con un link a su pantalla completa. No duplica lógica: reusa los hooks y componentes de cada feature.
 */
export function AhorrosYMetasPage() {
  const navigate = useNavigate()
  const ahorros = useAhorros()
  const savings = useSavings()
  const { usesUsd } = useSecondaryCurrency()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [creatingGoal, setCreatingGoal] = useState(false)
  const today = todayIso()

  const entries = ahorros.data ?? []
  const currencies = visibleCurrencies(usesUsd, entries)
  const goals = savings.data?.goals ?? []
  const active = goalsByStatus(goals, 'active')

  return (
    <section className="flex flex-col gap-3 px-[18px] pb-4 pt-1">
      <MentaHeader title="Ahorros y metas" backTo="/mas" />

      <section aria-labelledby="ahorros-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="ahorros-heading" className="text-[13px] font-bold uppercase tracking-[0.14em] text-text-muted">
            Ahorros
          </h2>
          <Link to="/ahorros" className="min-h-11 text-[14px] font-extrabold underline">
            Ver historial completo
          </Link>
        </div>
        {ahorros.isLoading ? (
          <Skeleton className="h-24" />
        ) : ahorros.isError ? (
          <EmptyState
            mascotUrl={mascotAssistant}
            title="No pudimos cargar tus ahorros"
            description="Revisá tu conexión y probá de nuevo."
            action={<Button onClick={() => void ahorros.refetch()}>Reintentar</Button>}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {currencies.map(({ code, label }) => {
              const balance = balanceOf(entries, code)
              return (
                <li key={code} className="rounded-[26px] bg-card p-4">
                  <p className="text-[14px] font-bold text-text-muted">{label} ({code})</p>
                  <p className="mt-1 font-display text-[28px] font-extrabold leading-none tracking-[-0.02em]">
                    {formatSaving(balance, code)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSheet({ kind: 'deposit', currency: code })}
                      aria-label={`Agregar ahorro en ${label.toLowerCase()}`}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-forest text-[14px] font-extrabold text-cream"
                    >
                      <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} /> Agregar
                    </button>
                    <button
                      type="button"
                      disabled={balance <= 0}
                      onClick={() => setSheet({ kind: 'withdrawal', currency: code })}
                      aria-label={`Retirar ahorro en ${label.toLowerCase()}`}
                      className="flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-line text-[14px] font-extrabold disabled:opacity-50"
                    >
                      <Minus aria-hidden="true" className="size-4" strokeWidth={2.5} /> Retirar
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="metas-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="metas-heading" className="text-[13px] font-bold uppercase tracking-[0.14em] text-text-muted">
            Metas de ahorro
          </h2>
          <span className="flex items-center gap-3">
            <Link to="/metas" className="min-h-11 text-[14px] font-extrabold underline">
              Ver todas
            </Link>
            <button
              type="button"
              aria-label="Agregar una meta"
              onClick={() => setCreatingGoal(true)}
              className={MENTA_CIRCLE}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2} />
            </button>
          </span>
        </div>
        {savings.isLoading ? (
          <Skeleton className="h-36" />
        ) : savings.isError ? (
          <EmptyState
            mascotUrl={mascotAssistant}
            title="No pudimos cargar tus metas"
            description="Revisá tu conexión y probá de nuevo."
            action={<Button onClick={() => void savings.refetch()}>Reintentar</Button>}
          />
        ) : active.length === 0 ? (
          <div className="rounded-[24px] border border-line bg-card p-4">
            <EmptyState
              mascotUrl={mascotAssistant}
              title="Todavía no tenés metas"
              description="Reservá plata de tus cuentas para un viaje, un auto o tu fondo de emergencia."
              action={<Button onClick={() => setCreatingGoal(true)}>Crear mi primera meta</Button>}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {active.map((goal) => (
              <li key={goal.id}>
                <GoalRingCard
                  goal={goal}
                  today={savings.data?.today ?? today}
                  rows={null}
                  onOpen={() => navigate(`/metas/${goal.id}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet && <AhorroSheet kind={sheet.kind} currency={sheet.currency} onClose={() => setSheet(null)} />}
      {creatingGoal && <NewGoalSheet onClose={() => setCreatingGoal(false)} />}
    </section>
  )
}
