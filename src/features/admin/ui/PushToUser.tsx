import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { adminApi, AdminApiError } from '../api/adminRepository'
import type { PushResult } from '../domain/types'
import { PanelCard } from './widgets'

const TITLE_MAX = 80
const BODY_MAX = 240

function describeError(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60))
      return `Llegaste al límite de 10 avisos por hora. Probá de nuevo en ${minutes} min.`
    }
    if (error.status === 404) return 'No encontramos a ese usuario.'
    if (error.reason === 'server_misconfigured')
      return 'Los avisos push no están configurados en el servidor.'
  }
  return 'No pudimos enviar el aviso. Probá de nuevo.'
}

export function PushToUser({ userId, devices }: { userId: string; devices: number }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<PushResult | null>(null)

  const send = useMutation({
    mutationFn: () => adminApi.pushToUser({ userId, title: title.trim(), body: body.trim() }),
    onSuccess: (data) => {
      setResult(data)
      setTitle('')
      setBody('')
    },
  })

  const valid = title.trim() !== '' && body.trim() !== ''
  const fieldClass =
    'w-full rounded-2xl border border-sand bg-card px-4 py-3 text-[16px] text-ink placeholder:text-placeholder'

  return (
    <PanelCard title="Enviar aviso push">
      <p className="text-[14px] text-text-muted">
        {devices === 0
          ? 'Esta persona no activó los avisos en ningún dispositivo: no hay a dónde enviarlo.'
          : `Se envía a ${devices} dispositivo(s). Máximo 10 avisos por hora. Queda registrado quién lo envió y cuándo, no el texto.`}
      </p>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={TITLE_MAX}
        placeholder="Título"
        aria-label="Título del aviso"
        className={fieldClass}
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={BODY_MAX}
        rows={3}
        placeholder="Mensaje"
        aria-label="Mensaje del aviso"
        className={fieldClass}
      />
      <Button
        variant="dark"
        className="h-12 w-auto self-start px-8 text-base"
        disabled={!valid || send.isPending || devices === 0}
        onClick={() => {
          setResult(null)
          send.reset()
          setConfirming(true)
        }}
      >
        Enviar aviso
      </Button>
      {send.isError && (
        <p role="alert" className="text-[15px] font-semibold text-expense">
          {describeError(send.error)}
        </p>
      )}
      {result && (
        <p role="status" className="text-[15px] font-semibold">
          Enviado: {result.sent} de {result.recipients}
          {result.failed > 0 ? ` · ${result.failed} con error` : ''}
          {result.removed > 0 ? ` · ${result.removed} dispositivo(s) dado(s) de baja` : ''}.
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="¿Enviar este aviso?"
          message={`"${title.trim()}" le va a llegar a esta persona. No se puede deshacer.`}
          confirmLabel="Enviar"
          onConfirm={() => {
            setConfirming(false)
            send.mutate()
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </PanelCard>
  )
}
