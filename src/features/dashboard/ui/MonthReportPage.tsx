import { Banknote, CreditCard, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { AssistantEntryLink } from '@/features/assistant/ui/AssistantEntryLink'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { availableBalance } from '@/features/accounts/domain/account'
import { formatArs } from '@/shared/lib/money'
import { monthStart, todayIso } from '@/shared/lib/month'
import { AmountDisplay } from '@/shared/ui/AmountDisplay'
import { MonthPicker } from '@/shared/ui/MonthPicker'
import { PageHeader } from '@/shared/ui/PageHeader'
import { themedColor } from '@/shared/ui/categoryIcons'
import { Panel } from '@/shared/ui/kit'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useMonthSummary } from '../api/useMonthSummary'

const ACCOUNT_ICONS = {
  bank: CreditCard,
  wallet: WalletCards,
  cash: Banknote,
  credit_card: CreditCard,
}

// Screen 034 — Este mes (real data: month summary + accounts).
export function MonthReportPage() {
  const latest = monthStart(todayIso())
  const [month, setMonth] = useState(latest)
  const summary = useMonthSummary(month)
  const accounts = useAccounts()
  const data = summary.data
  const sorted = [...(data?.byCategory ?? [])].sort((a, b) => b.amountCents - a.amountCents)
  const accountList = accounts.data ?? []

  return (
    <div className="pb-6">
      <div className="px-5 pt-14">
        {/* Back to where the report was opened from (Inicio, Tu año, the assistant…); Inicio if there was nothing before. */}
        <PageHeader title="Informes" fallbackTo="/" />
      </div>
      <header className="mx-5 mt-4 rounded-[32px] bg-forest p-5 text-cream">
        <div className="flex items-center justify-between gap-3">
          <MonthPicker value={month} latest={latest} onChange={setMonth} />
          <Link
            to="/tu-anio"
            replace
            className="flex min-h-9 items-center rounded-full bg-white/15 px-4 text-[15px] font-extrabold"
          >
            Tu año
          </Link>
        </div>
        <p className="mt-4 text-[17px] text-text-muted-on-dark">Gastaste en el mes</p>
        <p className="flex items-baseline gap-1 font-display font-extrabold">
          <span className="text-[32px] text-blush">-$</span>
          {data ? (
            <AmountDisplay
              cents={data.expenseCents}
              bare
              className="text-[clamp(36px,11vw,48px)] leading-tight"
            />
          ) : (
            <Skeleton className="h-14 w-48" />
          )}
        </p>
        {data && (
          <p className="text-[16px] text-text-muted-on-dark">
            Ingresaste {formatArs(data.incomeCents)} y te quedaron {formatArs(data.balanceCents)}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-4 px-5 pt-4">
        <AssistantEntryLink />
        <Panel>
          <div className="flex items-baseline justify-between">
            <h2 className="text-[22px] font-extrabold">Por categoría</h2>
            <span className="text-[15px] text-text-muted">{sorted.length} categorías</span>
          </div>
          {sorted.length > 0 ? (
            <>
              <div className="mt-3 flex h-3 gap-1" aria-hidden="true">
                {sorted.map((s) => (
                  <span
                    key={s.categoryId}
                    className="rounded-full"
                    style={{ flexGrow: s.percent, backgroundColor: themedColor(s.color) }}
                  />
                ))}
              </div>
              <ul className="mt-2 divide-y divide-line">
                {sorted.map((s) => (
                  <li key={s.categoryId} className="flex items-center gap-3 py-2.5">
                    <span
                      aria-hidden="true"
                      className="size-5 shrink-0 rounded-full"
                      style={{ backgroundColor: themedColor(s.color) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[18px] font-extrabold">{s.name}</span>
                      <span className="block text-[15px] text-text-muted">
                        {Math.round(s.percent)}% del total
                      </span>
                    </span>
                    <AmountDisplay cents={-s.amountCents} className="text-[18px] font-extrabold" />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-text-muted">
              {summary.isLoading ? 'Cargando…' : 'Todavía no hay gastos este mes.'}
            </p>
          )}
        </Panel>

        <section className="rounded-[28px] bg-forest p-5 text-cream">
          <div className="flex justify-between text-[13px] font-extrabold uppercase tracking-[0.12em] text-text-muted-on-dark">
            <span>Saldo total</span>
            <span className="normal-case tracking-normal">
              {accountList.length} {accountList.length === 1 ? 'medio' : 'medios'} de pago
            </span>
          </div>
          <AmountDisplay
            cents={availableBalance(accountList)}
            className="mt-1 block font-display text-[clamp(30px,9vw,38px)] font-extrabold"
          />
          <p className="text-[15px] leading-5 text-text-muted-on-dark">
            Lo que tenés hoy en todos tus medios. No es lo mismo que el balance del mes.
          </p>
          <ul className="mt-3 divide-y divide-white/10 border-t border-white/10">
            {accountList.map((a) => {
              const Icon = ACCOUNT_ICONS[a.kind] ?? CreditCard
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-[17px]">
                  <Icon aria-hidden="true" className="size-5 text-lime" />
                  <span className="flex-1 font-extrabold">{a.name}</span>
                  <AmountDisplay cents={a.balanceCents} className="font-extrabold" />
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
