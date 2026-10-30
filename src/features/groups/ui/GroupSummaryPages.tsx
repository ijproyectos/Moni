import {
  Bell,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  Plus,
  Upload,
  WalletCards,
} from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import mascotUrl from '@/assets/mascot/expresion_picaro.svg'
import { useAccounts } from '@/features/accounts/api/useAccounts'
import { useAccountAliases } from '@/features/accounts/mock/aliasStore'
import { formatLongDay } from '@/shared/lib/dates'
import { formatArs } from '@/shared/lib/money'
import { copyText } from '@/shared/lib/share'
import { BottomSheet } from '@/shared/ui/BottomSheet'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { Avatar, CheckDot, DashedButton, IconTile, Page, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { SegmentedControl } from '@/shared/ui/SegmentedControl'
import { useToast } from '@/shared/ui/toastContext'
import { useGroupLedger } from '../api/useGroupLedger'
import { personName, type Ledger, type Person } from '../domain/ledger'
import { patchOverlay } from '../mock/overlayStore'
import { AvatarStack } from './groupVisuals'

function useSummaryData() {
  const { id: groupId = '' } = useParams()
  const data = useGroupLedger(groupId)
  const aliases = useAccountAliases()
  const accounts = useAccounts()
  const accountAliases = (accounts.data ?? [])
    .map((a) => ({ account: a.name, alias: aliases[a.id]?.alias ?? '' }))
    .filter((a) => a.alias)
  const myAlias =
    data.overlay.collectAlias ??
    Object.values(aliases).find((a) => a.forCollecting)?.alias ??
    accountAliases[0]?.alias ??
    ''
  const aliasOf = (p: Person | undefined) => (p?.isMe ? myAlias : (p?.alias ?? ''))
  return { groupId, ...data, myAlias, accountAliases, aliasOf }
}

function sentence(ledger: Ledger, meId: string, from: string, to: string, cents: number) {
  const f = personName(ledger.people, from)
  const t = personName(ledger.people, to)
  if (from === meId) return `Le pasás ${formatArs(cents)} a ${t}`
  if (to === meId) return `${f} me pasa ${formatArs(cents)}`
  return `${f} le pasa ${formatArs(cents)} a ${t}`
}

// Screens 042 / 056 — Resumen.
export function GroupSummaryPage() {
  const navigate = useNavigate()
  const { groupId, ledger, name, aliasOf } = useSummaryData()
  const dates = ledger.expenses.map((e) => e.occurredOn).sort()
  const last = dates[dates.length - 1]
  const when = last ? formatLongDay(last) : ''
  return (
    <Page className="pb-28">
      <PageHeader title="Resumen" backTo={`/grupos/${groupId}`} />
      <article className="rounded-[24px] border border-sand bg-card p-4 shadow-sm">
        <header className="flex items-center gap-3">
          <img src={mascotUrl} alt="" className="size-12 rounded-[12px] bg-lime p-1" />
          <div>
            <h2 className="text-[24px] font-extrabold leading-7">{name}</h2>
            <p className="text-[15px] text-text-muted">
              {when} · {ledger.people.length} personas
            </p>
          </div>
        </header>
        <SectionLabel className="mt-4">Quién le pasa a quién</SectionLabel>
        {ledger.transfers.length === 0 ? (
          <p className="py-3 text-[16px]">¡Están todos a mano!</p>
        ) : (
          <ul className="divide-y divide-sand">
            {ledger.transfers.map((t) => {
              const to = ledger.people.find((p) => p.id === t.toUserId)
              return (
                <li key={`${t.fromUserId}-${t.toUserId}`} className="flex items-center gap-3 py-3">
                  <AvatarStack
                    people={[
                      { name: personName(ledger.people, t.fromUserId) },
                      { name: to?.name ?? '' },
                    ]}
                    size="md"
                  />
                  <span className="flex-1">
                    <span className="block text-[18px] font-extrabold">
                      {personName(ledger.people, t.fromUserId)} → {to?.isMe ? 'vos' : to?.name}
                    </span>
                    {aliasOf(to) && (
                      <span className="flex items-center gap-1 text-[14px] text-text-muted">
                        <Copy aria-hidden="true" className="size-3.5" /> {aliasOf(to)}
                      </span>
                    )}
                  </span>
                  <span className="text-[24px] font-extrabold text-income">
                    {formatArs(t.amountCents)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <SectionLabel className="mt-3">Gastos</SectionLabel>
        <table className="mt-1 w-full text-[16px]">
          <tbody>
            {ledger.expenses.map((e) => (
              <tr key={e.id}>
                <td className="py-1">{e.description}</td>
                <td className="py-1 text-text-muted">
                  {e.payers.length > 1
                    ? 'Varios'
                    : personName(ledger.people, e.payers[0]?.personId ?? '')}
                </td>
                <td className="py-1 text-right font-extrabold">{formatArs(e.amountCents)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink">
              <td className="pt-2 text-[17px] font-extrabold" colSpan={2}>
                Total
              </td>
              <td className="pt-2 text-right text-[20px] font-extrabold">
                {formatArs(ledger.totalCents)}
              </td>
            </tr>
          </tbody>
        </table>
        <SectionLabel className="mt-4">Cuentas</SectionLabel>
        <table className="mt-1 w-full text-[15px]">
          <thead>
            <tr className="text-text-muted">
              <th className="text-left font-normal" />
              <th className="text-right font-normal">Puso</th>
              <th className="text-right font-normal">Su parte</th>
              <th className="text-right font-normal">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {ledger.people.map((p) => {
              const net = ledger.nets[p.id] ?? 0
              return (
                <tr key={p.id}>
                  <td className="py-1 font-extrabold">{p.name}</td>
                  <td className="py-1 text-right">{formatArs(ledger.paid[p.id] ?? 0)}</td>
                  <td className="py-1 text-right">{formatArs(ledger.owed[p.id] ?? 0)}</td>
                  <td
                    className={cn(
                      'py-1 text-right font-extrabold',
                      net > 0 ? 'text-income' : net < 0 ? 'text-expense' : '',
                    )}
                  >
                    {formatArs(net, { signed: true })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-4 border-t border-dashed border-sand pt-3 text-center text-[14px] text-text-muted">
          Hecho con Moni
        </p>
      </article>
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button variant="dark" onClick={() => navigate(`/grupos/${groupId}/compartir`)}>
          <Upload aria-hidden="true" className="mr-2 size-5" /> Compartir resumen
        </Button>
      </div>
    </Page>
  )
}

// Screens 043 / 044 / 057 / 058 / 059 — Compartir resumen.
export function ShareSummaryPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { groupId, ledger, name, meId, myAlias, accountAliases, aliasOf } = useSummaryData()
  const [tab, setTab] = useState<'moni' | 'text'>('moni')
  const [choosingAlias, setChoosingAlias] = useState(false)
  const involved = ledger.people.filter(
    (p) => !p.isMe && ledger.transfers.some((t) => t.fromUserId === p.id || t.toUserId === p.id),
  )

  const lineFor = (p: Person) => {
    const out = ledger.transfers.filter((t) => t.fromUserId === p.id)
    const incoming = ledger.transfers.filter((t) => t.toUserId === p.id)
    if (out[0]) {
      const to = out[0].toUserId
      return to === meId
        ? `Pasame ${formatArs(out[0].amountCents)}`
        : `Pasale ${formatArs(out[0].amountCents)} a ${personName(ledger.people, to)}`
    }
    if (incoming.length) {
      const total = incoming.reduce((s, t) => s + t.amountCents, 0)
      const from = incoming.map((t) => personName(ledger.people, t.fromUserId))
      return `Te pasan ${formatArs(total)}${from.length > 1 ? ` entre ${from.join(' y ')}` : ` · ${from[0]}`}`
    }
    return 'Está a mano'
  }
  const groupText = [
    name,
    ...ledger.transfers.map((t) => {
      const to = ledger.people.find((p) => p.id === t.toUserId)
      const alias = aliasOf(to)
      return `${sentence(ledger, meId, t.fromUserId, t.toUserId, t.amountCents)}${alias ? ` (${alias})` : ''}`
    }),
  ].join('\n')

  return (
    <Page className="pb-28">
      <PageHeader title="Compartir resumen" backTo={`/grupos/${groupId}/resumen`} />
      <SegmentedControl
        label="Cómo compartir"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'moni', label: 'Avisar en Moni' },
          { value: 'text', label: 'Copiar texto' },
        ]}
      />
      {tab === 'moni' ? (
        <>
          <p className="text-[16px] leading-6">
            Cada uno recibe una notificación con lo que tiene que hacer.
          </p>
          <ul className="flex flex-col gap-3">
            {involved.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-[24px] border border-sand bg-card p-4"
              >
                <Avatar name={p.name} size="lg" />
                <span className="flex-1">
                  <span className="block text-[18px] font-extrabold">{p.name}</span>
                  <span className="block text-[15px] leading-5 text-text-muted">{lineFor(p)}</span>
                </span>
                {p.hasMoni ? (
                  <span className="rounded-full bg-lime/40 px-3 py-1 text-[13px] font-extrabold">
                    Le llega en Moni
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(`${name}: ${lineFor(p)}`, toast, 'Mensaje copiado')
                    }
                    className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3 text-[15px] font-extrabold"
                  >
                    <Copy aria-hidden="true" className="size-4" /> Copiar
                  </button>
                )}
              </li>
            ))}
          </ul>
          {involved.some((p) => !p.hasMoni) && (
            <p className="text-[15px] leading-5">
              {involved
                .filter((p) => !p.hasMoni)
                .map((p) => p.name)
                .join(' y ')}{' '}
              todavía no tiene Moni: copiale el mensaje y mandalo por donde quieras.
            </p>
          )}
          <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <Button
              variant="dark"
              disabled={involved.length === 0}
              onClick={() => navigate(`/grupos/${groupId}/avisados`)}
            >
              <Bell aria-hidden="true" className="mr-2 size-5" /> Avisar a todos
            </Button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setChoosingAlias(true)}
            className="flex items-center gap-3 rounded-[24px] border border-sand bg-card p-4 text-left"
          >
            <IconTile icon={WalletCards} bg="#e3f2cf" />
            <span className="flex-1">
              <SectionLabel>Te pasan la plata a</SectionLabel>
              <span className="block text-[18px] font-extrabold">
                {myAlias || 'Elegí un alias'}
              </span>
            </span>
            <span className="flex items-center text-[15px] font-extrabold">
              Cambiar <ChevronRight aria-hidden="true" className="size-4" />
            </span>
          </button>
          <SectionLabel>Para el grupo</SectionLabel>
          <div className="whitespace-pre-line rounded-[20px] bg-lime/30 p-4 text-[16px] leading-7">
            <strong className="font-extrabold">{name}</strong>
            {'\n'}
            {groupText.split('\n').slice(1).join('\n')}
          </div>
          <SectionLabel>Para cada uno</SectionLabel>
          <ul className="flex flex-col gap-3">
            {involved
              .filter((p) => ledger.transfers.some((t) => t.fromUserId === p.id))
              .map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-[22px] border border-sand bg-card px-4 py-3"
                >
                  <Avatar name={p.name} />
                  <span className="flex-1">
                    <span className="block text-[17px] font-extrabold">{p.name}</span>
                    <span className="block text-[15px] text-text-muted">{lineFor(p)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void copyText(
                        `${name}: ${lineFor(p)}${myAlias ? ` (${myAlias})` : ''}`,
                        toast,
                        'Mensaje copiado',
                      )
                    }
                    className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3 text-[15px] font-extrabold"
                  >
                    <Copy aria-hidden="true" className="size-4" /> Copiar
                  </button>
                </li>
              ))}
          </ul>
          <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <Button variant="dark" onClick={() => void copyText(groupText, toast, 'Texto copiado')}>
              <Copy aria-hidden="true" className="mr-2 size-5" /> Copiar texto del grupo
            </Button>
          </div>
        </>
      )}
      {choosingAlias && (
        <BottomSheet title="¿A dónde te pasan la plata?" onClose={() => setChoosingAlias(false)}>
          <p className="-mt-2 text-[15px] text-text-muted">
            Este alias aparece en el resumen que mandás.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {accountAliases.map((a) => (
              <li key={a.alias}>
                <button
                  type="button"
                  onClick={() => patchOverlay(groupId, { collectAlias: a.alias })}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-[20px] border-2 bg-card px-4 py-3 text-left',
                    myAlias === a.alias ? 'border-ink' : 'border-sand',
                  )}
                >
                  <IconTile icon={CreditCard} bg="#e3f2cf" />
                  <span className="flex-1">
                    <span className="block text-[18px] font-extrabold">{a.account}</span>
                    <span className="block text-[15px] text-text-muted">{a.alias}</span>
                  </span>
                  <CheckDot checked={myAlias === a.alias} />
                </button>
              </li>
            ))}
          </ul>
          {accountAliases.length === 0 && (
            <p className="mt-3 text-[15px]">Todavía no cargaste alias en tus medios de pago.</p>
          )}
          <DashedButton className="mt-3" onClick={() => navigate('/cuentas')}>
            <Plus aria-hidden="true" className="size-5" /> Agregar otro alias
          </DashedButton>
          <Button className="mt-3" onClick={() => setChoosingAlias(false)}>
            Listo
          </Button>
        </BottomSheet>
      )}
    </Page>
  )
}

// Screens 156 / 157 — Avisos enviados.
export function NoticesSentPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { groupId, ledger, name, meId } = useSummaryData()
  const involved = ledger.people.filter(
    (p) => !p.isMe && ledger.transfers.some((t) => t.fromUserId === p.id || t.toUserId === p.id),
  )
  const withMoni = involved.filter((p) => p.hasMoni)
  const line = (p: Person) => {
    const out = ledger.transfers.find((t) => t.fromUserId === p.id)
    if (out)
      return out.toUserId === meId
        ? `Pasame ${formatArs(out.amountCents)}`
        : `Pasale ${formatArs(out.amountCents)} a ${personName(ledger.people, out.toUserId)}`
    const incoming = ledger.transfers.filter((t) => t.toUserId === p.id)
    return `Te pasan ${formatArs(incoming.reduce((s, t) => s + t.amountCents, 0))}`
  }
  return (
    <Page className="pb-28 pt-20">
      <span className="mx-auto flex size-24 items-center justify-center rounded-full bg-lime">
        <Check aria-hidden="true" className="size-12" strokeWidth={3} />
      </span>
      <h1 className="text-center font-display text-[30px] font-extrabold leading-9">
        {withMoni.length ? `Avisamos a ${withMoni.map((p) => p.name).join(' y ')}` : 'Listo'}
      </h1>
      <p className="text-center text-[16px] leading-6 text-text-muted">
        Les llegó una notificación con lo que tiene que hacer cada uno.
      </p>
      <ul className="flex flex-col gap-3">
        {involved.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-3 rounded-[24px] border border-sand bg-card p-4"
          >
            <Avatar name={p.name} size="lg" />
            <span className="flex-1">
              <span className="block text-[18px] font-extrabold">{p.name}</span>
              <span className="block text-[15px] leading-5 text-text-muted">
                {line(p)}
                {!p.hasMoni && ' · falta mandarle el mensaje'}
              </span>
            </span>
            {p.hasMoni ? (
              <span className="rounded-full bg-lime/40 px-3 py-1 text-[13px] font-extrabold">
                Avisado en Moni
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void copyText(`${name}: ${line(p)}`, toast, 'Mensaje copiado')}
                className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink px-3 text-[15px] font-extrabold"
              >
                <Copy aria-hidden="true" className="size-4" /> Copiar
              </button>
            )}
          </li>
        ))}
      </ul>
      {involved.some((p) => !p.hasMoni) && (
        <p className="text-[15px] leading-5">
          {involved
            .filter((p) => !p.hasMoni)
            .map((p) => p.name)
            .join(' y ')}{' '}
          todavía no tiene Moni, así que copiale el mensaje y mandaselo por donde quieras. Las
          notificaciones las ves en Avisos.
        </p>
      )}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button onClick={() => navigate(`/grupos/${groupId}`, { replace: true })}>
          <Check aria-hidden="true" className="mr-2 size-5" /> Listo
        </Button>
      </div>
    </Page>
  )
}
