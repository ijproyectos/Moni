import { useState } from 'react'
import { Card } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Page, SectionLabel } from '@/shared/ui/kit'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'
import { useCreateTicket, useMyTickets } from '../api/useSupport'
import {
  describeTicketError,
  MESSAGE_MAX,
  SUBJECT_MAX,
  TICKET_PROBLEM_TEXT,
  ticketStatusLabel,
  validateTicket,
  type Ticket,
} from '../domain/support'

const FIELD =
  'w-full rounded-2xl border border-line bg-card px-4 py-3 text-[16px] text-ink placeholder:text-text-muted'

const DATE = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' })

function TicketCard({ ticket }: { ticket: Ticket }) {
  const label = ticketStatusLabel(ticket)
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-[17px] font-extrabold leading-6">{ticket.subject}</h3>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-extrabold ${
            label === 'Abierta' ? 'bg-tint-gold text-ink' : 'bg-tint-green text-ink'
          }`}
        >
          {label}
        </span>
      </div>
      <p className="text-[13px] text-text-muted">{DATE.format(new Date(ticket.createdAt))}</p>
      <p className="whitespace-pre-wrap text-[15px]">{ticket.message}</p>
      {ticket.reply && (
        <div className="rounded-2xl bg-sand p-3">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-text-muted">
            Respuesta de Moni
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[15px]">{ticket.reply}</p>
        </div>
      )}
    </Card>
  )
}

/** "Soporte": write to the Moni team and read their answers. */
export function SupportPage() {
  const toast = useToast()
  const tickets = useMyTickets()
  const create = useCreateTicket()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)

  const problem = validateTicket({ subject, message })
  const list = tickets.data ?? []

  async function submit() {
    setTouched(true)
    if (problem) return
    try {
      await create.mutateAsync({ subject, message })
      setSubject('')
      setMessage('')
      setTouched(false)
      toast.show('Recibimos tu consulta. Te respondemos por acá y te avisamos.')
    } catch {
      // The error text is shown under the form (create.error).
    }
  }

  return (
    <Page className="pb-10">
      <PageHeader title="Soporte" backTo="/perfil" />

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-[20px] font-extrabold">Contactar a soporte</h2>
        <p className="text-[15px] text-text-muted">
          Tu consulta la lee el equipo de Moni. No incluyas contraseñas ni datos de tus tarjetas.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-text-muted">Asunto</span>
          <input
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="Por ejemplo: no me carga un gasto"
            className={FIELD}
          />
        </label>
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1">
            <span className="text-[14px] font-bold text-text-muted">Mensaje</span>
            <textarea
              value={message}
              maxLength={MESSAGE_MAX}
              rows={5}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Contanos qué pasó"
              className={FIELD}
            />
          </label>
          <span aria-hidden="true" className="self-end text-[12px] text-text-muted">
            {message.length}/{MESSAGE_MAX}
          </span>
        </div>
        {touched && problem && (
          <p role="alert" className="text-[15px] font-semibold text-expense">
            {TICKET_PROBLEM_TEXT[problem]}
          </p>
        )}
        {create.isError && (
          <p role="alert" className="text-[15px] font-semibold text-expense">
            {describeTicketError(create.error)}
          </p>
        )}
        <Button disabled={create.isPending} onClick={() => void submit()}>
          {create.isPending ? 'Enviando…' : 'Enviar consulta'}
        </Button>
      </Card>

      <SectionLabel className="mt-1">Mis consultas</SectionLabel>
      {tickets.isLoading ? (
        <div role="status" aria-label="Cargando consultas" className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : tickets.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-[15px] text-expense">
            No pudimos cargar tus consultas.
          </p>
          <Button
            variant="dark"
            className="h-11 w-auto px-6 text-base"
            onClick={() => void tickets.refetch()}
          >
            Reintentar
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-[15px] text-text-muted">Todavía no enviaste ninguna consulta.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </Page>
  )
}
