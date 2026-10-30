import { Check, ChevronDown, Copy, Handshake } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useMyGroups } from '@/features/groups/api/useGroups'
import { formatDayMonth } from '@/shared/lib/dates'
import { toUserMessage } from '@/shared/lib/errors'
import { formatArs } from '@/shared/lib/money'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Avatar } from '@/shared/ui/kit'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { Skeleton } from '@/shared/ui/Skeleton'
import { copyText } from '@/shared/lib/share'
import { useToast } from '@/shared/ui/toastContext'
import { isDebtsNotEnabled } from '../api/debtsRepository'
import {
  useCancelPayment,
  useConfirmPayment,
  useNotices,
  usePendingDebts,
  useRejectPayment,
  useReportPayment,
} from '../api/useDebts'
import {
  reportStatusLabel,
  sharedTransferFor,
  type DebtDirection,
  type PendingDebt,
} from '../domain/debts'
import { CollectSheet } from './CollectSheet'

const pill =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[15px] font-extrabold disabled:opacity-60 [&>svg]:shrink-0'

/**
 * "Deudas de grupos": opened from the green "Debés / Te deben" box. Every real debt of the person's groups in two tabs,
 * "Me deben" and "Debo". The tab it opens on depends on the amount that was tapped. A debt is only settled when who
 * receives the money confirms it; nothing here moves a balance by itself.
 */
export function GroupDebtsSheet({
  initialTab,
  onClose,
}: {
  initialTab: DebtDirection
  onClose: () => void
}) {
  const toast = useToast()
  const { debts, reports, isLoading, isError } = usePendingDebts()
  const notices = useNotices()
  const groups = useMyGroups()
  const report = useReportPayment()
  const confirm = useConfirmPayment()
  const reject = useRejectPayment()
  const cancel = useCancelPayment()
  const [tab, setTab] = useState<DebtDirection>(initialTab)
  const [collecting, setCollecting] = useState<PendingDebt | null>(null)
  const [paying, setPaying] = useState<PendingDebt | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  // Without the migration the debts are listed but nothing can be sent or confirmed.
  const actionsEnabled = !(reports.isError && isDebtsNotEnabled(reports.error))
  const shown = debts.filter((d) => d.direction === tab)
  const total = shown.reduce((sum, d) => sum + d.amountCents, 0)
  const groupName = new Map((groups.data ?? []).map((g) => [g.id, g.name]))
  const history = (reports.data ?? []).filter((r) => r.status !== 'reported')

  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action()
      toast.show(done)
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  async function confirmReceipt(debt: PendingDebt) {
    if (!debt.report) return
    try {
      const settled = await confirm.mutateAsync(debt.report.id)
      toast.show(
        settled
          ? `Listo, ${debt.otherName} quedó al día`
          : 'Esa deuda ya estaba saldada: no registramos nada de más.',
      )
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    }
  }

  return (
    <BottomSheet title="Deudas de grupos" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SegmentedControl
          label="Tipo de deuda"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'owed', label: 'Me deben' },
            { value: 'owe', label: 'Debo' },
          ]}
        />

        {isLoading ? (
          <div role="status" aria-label="Cargando deudas" className="flex flex-col gap-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        ) : isError ? (
          <p className="text-[15px] text-text-muted">
            No pudimos calcular tus deudas. Probá de nuevo.
          </p>
        ) : shown.length === 0 ? (
          <div className="flex items-center gap-3 rounded-[24px] border border-sand bg-card p-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime/40">
              <Handshake aria-hidden="true" className="size-6" />
            </span>
            <span>
              <span className="block text-[18px] font-extrabold">
                {tab === 'owed' ? 'Nadie te debe nada' : 'No le debés nada a nadie'}
              </span>
              <span className="block text-[15px] leading-5 text-text-muted">
                Estás al día en todos tus grupos.
              </span>
            </span>
          </div>
        ) : (
          <>
            <p className="text-[15px] text-text-muted">
              {tab === 'owed' ? 'En total te deben ' : 'En total debés '}
              <strong className="font-extrabold text-ink">{formatArs(total)}</strong>
              {shown.length > 1 ? ` entre ${shown.length} deudas.` : '.'}
            </p>
            <ul className="flex flex-col gap-3">
              {shown.map((debt) => {
                const owed = debt.direction === 'owed'
                const shared = owed ? null : sharedTransferFor(debt, notices.data ?? [])
                return (
                  <li key={debt.key} className="rounded-[24px] border border-sand bg-card p-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={debt.otherName} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[18px] font-extrabold leading-6">
                          {debt.otherName}
                        </span>
                        <Link
                          to={`/grupos/${debt.groupId}`}
                          onClick={onClose}
                          className="block truncate text-[15px] leading-5 text-text-muted underline"
                        >
                          {debt.groupName}
                        </Link>
                      </span>
                      <span className="text-right">
                        <span
                          className={cn(
                            'block font-display text-[20px] font-extrabold leading-6',
                            owed ? 'text-income' : 'text-expense',
                          )}
                        >
                          {formatArs(debt.amountCents)}
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-extrabold',
                            debt.report ? 'bg-gold/40' : 'bg-sand',
                          )}
                        >
                          {debt.report ? 'Pago informado' : 'Pendiente'}
                        </span>
                      </span>
                    </div>

                    {owed && debt.report && (
                      <>
                        <p className="mt-3 text-[15px] leading-5">
                          {debt.otherName} informó que te pagó. Cuando lo veas en tu cuenta,
                          confirmalo.
                        </p>
                        {actionsEnabled && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => void confirmReceipt(debt)}
                              disabled={confirm.isPending}
                              className={cn(pill, 'bg-lime')}
                            >
                              <Check aria-hidden="true" className="size-4" /> Confirmar recepción
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                debt.report &&
                                void run(
                                  () => reject.mutateAsync(debt.report?.id ?? ''),
                                  'Le avisamos que no lo recibiste',
                                )
                              }
                              disabled={reject.isPending}
                              className={cn(pill, 'border-2 border-sand bg-white')}
                            >
                              No lo recibí
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {owed && !debt.report && (
                      <button
                        type="button"
                        onClick={() => setCollecting(debt)}
                        className={cn(pill, 'mt-3 w-full bg-forest text-cream')}
                      >
                        Enviar cobro
                      </button>
                    )}

                    {!owed && shared && (
                      <div className="mt-3 rounded-[18px] bg-lime/30 p-3">
                        <p className="text-[14px] font-bold">
                          {debt.otherName} te compartió
                          {shared.label ? ` su cuenta ${shared.label}` : ' sus datos'}:
                        </p>
                        {[
                          ['Alias', shared.alias],
                          ['CBU/CVU', shared.cbu],
                        ]
                          .filter(([, value]) => value)
                          .map(([label, value]) => (
                            <div
                              key={label}
                              className="mt-1 flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 break-all text-[16px] font-extrabold">
                                {label}: {value}
                              </span>
                              <button
                                type="button"
                                aria-label={`Copiar ${label}`}
                                onClick={() =>
                                  void copyText(value ?? '', toast, `${label} copiado`)
                                }
                                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card"
                              >
                                <Copy aria-hidden="true" className="size-4" />
                              </button>
                            </div>
                          ))}
                      </div>
                    )}

                    {!owed && !debt.report && actionsEnabled && (
                      <button
                        type="button"
                        onClick={() => setPaying(debt)}
                        className={cn(pill, 'mt-3 w-full bg-lime')}
                      >
                        <Check aria-hidden="true" className="size-4" /> Ya pagué
                      </button>
                    )}

                    {!owed && debt.report && (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <p className="text-[15px] leading-5 text-text-muted">
                          Esperando que {debt.otherName} lo confirme.
                        </p>
                        {actionsEnabled && (
                          <button
                            type="button"
                            onClick={() =>
                              debt.report &&
                              void run(
                                () => cancel.mutateAsync(debt.report?.id ?? ''),
                                'Anulamos el aviso de pago',
                              )
                            }
                            disabled={cancel.isPending}
                            className="min-h-11 shrink-0 rounded-full border-2 border-sand px-4 text-[15px] font-extrabold"
                          >
                            Anular aviso
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {history.length > 0 && (
          <div className="rounded-[24px] border border-sand bg-card">
            <button
              type="button"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((v) => !v)}
              className="flex min-h-12 w-full items-center justify-between px-4 text-[17px] font-extrabold"
            >
              Historial de pagos
              <ChevronDown
                aria-hidden="true"
                className={cn('size-5 transition-transform', showHistory && 'rotate-180')}
              />
            </button>
            {showHistory && (
              <ul className="divide-y divide-sand px-4 pb-2">
                {history.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[16px] font-extrabold">
                        {formatArs(r.amountCents)} · {groupName.get(r.groupId) ?? 'Grupo'}
                      </span>
                      <span className="block text-[14px] text-text-muted">
                        {formatDayMonth((r.resolvedAt ?? r.reportedAt).slice(0, 10))}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-extrabold',
                        r.status === 'confirmed' ? 'bg-lime/50' : 'bg-sand',
                      )}
                    >
                      {reportStatusLabel(r.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {collecting && <CollectSheet debt={collecting} onClose={() => setCollecting(null)} />}
      {paying && (
        <ConfirmDialog
          title="¿Ya le pagaste?"
          message={`Le vamos a avisar a ${paying.otherName} que le transferiste ${formatArs(paying.amountCents)}. La deuda se salda cuando ${paying.otherName} confirme que lo recibió.`}
          confirmLabel="Sí, ya pagué"
          cancelLabel="Todavía no"
          isBusy={report.isPending}
          onConfirm={() => {
            const debt = paying
            setPaying(null)
            void run(
              () =>
                report.mutateAsync({
                  groupId: debt.groupId,
                  creditorId: debt.otherUserId,
                  amountCents: debt.amountCents,
                }),
              `Le avisamos a ${debt.otherName}`,
            )
          }}
          onCancel={() => setPaying(null)}
        />
      )}
    </BottomSheet>
  )
}
