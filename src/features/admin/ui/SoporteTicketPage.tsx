import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/shared/ui/Button'
import { adminApi, AdminApiError } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { formatArDateTime } from '../domain/format'
import { adminPath } from '../domain/paths'
import type { SupportReplyResult } from '../domain/types'
import { Chip, DetailRow, ErrorBlock, LoadingBlock, PanelCard } from './widgets'

const REPLY_MAX = 2000

/** One support ticket: what the person wrote, the answer, and the controls to reply or close it. */
export function SoporteTicketPage() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const query = useAdminQuery(['soporte', 'ticket', id], () => adminApi.soporteTicket(id))
  const [reply, setReply] = useState('')
  const [resolve, setResolve] = useState(true)
  const [sent, setSent] = useState<SupportReplyResult | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  const send = useMutation({
    mutationFn: () => adminApi.replyTicket({ ticketId: id, reply: reply.trim(), resolve }),
    onSuccess: async (data) => {
      setSent(data)
      setReply('')
      await refresh()
    },
  })
  const setStatus = useMutation({
    mutationFn: (status: 'open' | 'resolved') => adminApi.setTicketStatus({ ticketId: id, status }),
    onSuccess: refresh,
  })

  if (query.isPending) return <LoadingBlock />
  if (query.isError) {
    const notFound =
      query.error instanceof AdminApiError &&
      (query.error.status === 404 || query.error.status === 400)
    return notFound ? (
      <PanelCard>
        <p className="text-[15px]">No encontramos esa consulta.</p>
        <Link to={adminPath('soporte')} className="font-bold underline">
          Volver a soporte
        </Link>
      </PanelCard>
    ) : (
      <ErrorBlock onRetry={() => void query.refetch()} />
    )
  }
  const t = query.data
  const subject = encodeURIComponent(`Re: ${t.subject}`)

  return (
    <div className="flex flex-col gap-4">
      <Link to={adminPath('soporte')} className="text-[15px] font-bold underline">
        ← Soporte
      </Link>

      <PanelCard
        title="Consulta"
        aside={
          t.status === 'resolved' ? (
            <Chip>Resuelta</Chip>
          ) : t.reply ? (
            <Chip tone="recent">Respondida</Chip>
          ) : (
            <Chip tone="idle">Abierta</Chip>
          )
        }
      >
        <h2 className="font-display text-[20px] font-extrabold">{t.subject}</h2>
        <dl>
          <DetailRow label="Persona">
            <Link to={adminPath('usuarios', t.user_id)} className="underline">
              {t.email ?? '(sin email)'}
            </Link>
          </DetailRow>
          <DetailRow label="Nombre">{t.name ?? '—'}</DetailRow>
          <DetailRow label="Recibida">{formatArDateTime(t.created_at)}</DetailRow>
          <DetailRow label="Consultas de esta persona">{t.user_tickets_total}</DetailRow>
        </dl>
        <p className="whitespace-pre-wrap rounded-2xl bg-sand p-4 text-[16px]">{t.message}</p>
        {t.email && (
          <a
            href={`mailto:${t.email}?subject=${subject}`}
            className="self-start text-[15px] font-bold underline"
          >
            Escribirle por mail
          </a>
        )}
      </PanelCard>

      {t.reply && (
        <PanelCard title="Última respuesta">
          <p className="whitespace-pre-wrap text-[16px]">{t.reply}</p>
          <p className="text-[13px] text-text-muted">
            {t.replied_by ?? 'Equipo'} · {formatArDateTime(t.replied_at)}
          </p>
        </PanelCard>
      )}

      <PanelCard title={t.reply ? 'Responder de nuevo' : 'Responder'}>
        <p className="text-[14px] text-text-muted">
          La respuesta la ve la persona en la app (Perfil → Soporte) y le llega un aviso que no
          incluye el texto. Una nueva respuesta reemplaza a la anterior.
        </p>
        <textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          maxLength={REPLY_MAX}
          rows={5}
          placeholder="Escribí la respuesta"
          aria-label="Respuesta"
          className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-[16px] text-ink placeholder:text-placeholder"
        />
        <label className="flex items-center gap-2 text-[15px]">
          <input
            type="checkbox"
            checked={resolve}
            onChange={(event) => setResolve(event.target.checked)}
            className="size-5"
          />
          Marcar como resuelta al responder
        </label>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="dark"
            className="h-12 w-auto px-8 text-base"
            disabled={reply.trim() === '' || send.isPending}
            onClick={() => {
              setSent(null)
              send.reset()
              send.mutate()
            }}
          >
            Enviar respuesta
          </Button>
          <Button
            variant="ghost"
            className="text-ink"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate(t.status === 'resolved' ? 'open' : 'resolved')}
          >
            {t.status === 'resolved' ? 'Reabrir' : 'Marcar como resuelta'}
          </Button>
        </div>
        {send.isError && (
          <p role="alert" className="text-[15px] font-semibold text-expense">
            No pudimos enviar la respuesta. Probá de nuevo.
          </p>
        )}
        {setStatus.isError && (
          <p role="alert" className="text-[15px] font-semibold text-expense">
            No pudimos cambiar el estado. Probá de nuevo.
          </p>
        )}
        {sent && (
          <p role="status" className="text-[15px] font-semibold">
            Respuesta guardada.{' '}
            {sent.push.recipients === 0
              ? 'La persona no tiene avisos activados: la verá al abrir Soporte.'
              : `Aviso enviado a ${sent.push.sent} de ${sent.push.recipients} dispositivo(s).`}
          </p>
        )}
      </PanelCard>
    </div>
  )
}
