import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { adminApi } from '../api/adminRepository'
import { formatArDateTime } from '../domain/format'
import { describeSuspendError, emailConfirmed } from '../domain/messages'
import type { UserDetail } from '../domain/types'
import { Chip, DetailRow, PanelCard } from './widgets'

const REASON_MIN = 3
const REASON_MAX = 200
const FIELD =
  'w-full rounded-2xl border border-line bg-card px-4 py-3 text-[16px] text-ink placeholder:text-placeholder'

/** Suspend / reactivate an account. Suspending needs the typed email and a reason, and never targets an admin. */
export function SuspensionCard({ user }: { user: UserDetail }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [confirming, setConfirming] = useState<'suspend' | 'unsuspend' | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin'] })
  const suspend = useMutation({
    mutationFn: () =>
      adminApi.suspend({
        userId: user.user_id,
        reason: reason.trim(),
        confirmEmail: typedEmail.trim(),
      }),
    onSuccess: async () => {
      setReason('')
      setTypedEmail('')
      await refresh()
    },
  })
  const unsuspend = useMutation({
    mutationFn: () => adminApi.unsuspend(user.user_id),
    onSuccess: refresh,
  })

  const state = user.estado
  const reasonValid = reason.trim().length >= REASON_MIN && reason.trim().length <= REASON_MAX
  const canSuspend = reasonValid && emailConfirmed(typedEmail, user.email)

  if (state.suspended) {
    return (
      <PanelCard title="Cuenta suspendida" aside={<Chip tone="bad">Suspendida</Chip>}>
        <dl>
          <DetailRow label="Motivo">{state.suspension?.reason ?? '—'}</DetailRow>
          <DetailRow label="Por">{state.suspension?.suspended_by ?? '—'}</DetailRow>
          <DetailRow label="Desde">
            {formatArDateTime(state.suspension?.suspended_at ?? null)}
          </DetailRow>
        </dl>
        <p className="text-[14px] text-text-muted">
          No puede entrar a Moni ni recibir avisos. Sus datos se conservan.
        </p>
        <Button
          variant="dark"
          className="h-12 w-auto self-start px-8 text-base"
          disabled={unsuspend.isPending}
          onClick={() => {
            unsuspend.reset()
            setConfirming('unsuspend')
          }}
        >
          Reactivar cuenta
        </Button>
        {unsuspend.isError && (
          <p role="alert" className="text-[15px] font-semibold text-expense">
            {describeSuspendError(unsuspend.error)}
          </p>
        )}
        {confirming === 'unsuspend' && (
          <ConfirmDialog
            title="¿Reactivar esta cuenta?"
            message="La persona va a poder volver a entrar a Moni."
            confirmLabel="Reactivar"
            isBusy={unsuspend.isPending}
            onConfirm={() => {
              setConfirming(null)
              unsuspend.mutate()
            }}
            onCancel={() => setConfirming(null)}
          />
        )}
      </PanelCard>
    )
  }

  return (
    <PanelCard title="Suspender cuenta">
      <p className="text-[14px] text-text-muted">
        La persona deja de poder entrar y se cierran sus sesiones. Sus datos se conservan y la
        cuenta se puede reactivar. No se puede suspender a un administrador ni a vos mismo.
      </p>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={REASON_MAX}
        placeholder="Motivo (queda registrado, solo lo ve el equipo)"
        aria-label="Motivo de la suspensión"
        className={FIELD}
      />
      <input
        value={typedEmail}
        onChange={(event) => setTypedEmail(event.target.value)}
        placeholder={`Escribí ${user.email ?? 'el email'} para confirmar`}
        aria-label="Email para confirmar"
        autoComplete="off"
        className={FIELD}
      />
      <Button
        variant="dark"
        className="h-12 w-auto self-start px-8 text-base"
        disabled={!canSuspend || suspend.isPending}
        onClick={() => {
          suspend.reset()
          setConfirming('suspend')
        }}
      >
        Suspender cuenta
      </Button>
      {suspend.isError && (
        <p role="alert" className="text-[15px] font-semibold text-expense">
          {describeSuspendError(suspend.error)}
        </p>
      )}
      {confirming === 'suspend' && (
        <ConfirmDialog
          title="¿Suspender esta cuenta?"
          message={`${user.email ?? 'La persona'} no va a poder entrar a Moni hasta que la reactives.`}
          confirmLabel="Suspender"
          isBusy={suspend.isPending}
          onConfirm={() => {
            setConfirming(null)
            suspend.mutate()
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </PanelCard>
  )
}
