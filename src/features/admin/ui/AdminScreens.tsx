import { useState } from 'react'
import { Button } from '@/shared/ui/Button'
import { signInAdminWithGoogle } from '../api/adminAuth'
import type { AccessDeniedReason } from '../domain/types'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-5 px-6 py-10">
      <p className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-text-muted">
        Moni · Administración
      </p>
      {children}
    </main>
  )
}

function GoogleButton({ label, selectAccount }: { label: string; selectAccount: boolean }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <>
      <Button
        variant="dark"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(false)
          signInAdminWithGoogle(selectAccount).catch(() => {
            setBusy(false)
            setFailed(true)
          })
        }}
      >
        {label}
      </Button>
      {failed && (
        <p role="alert" className="text-[15px] font-semibold text-expense">
          No pudimos iniciar sesión con Google. Probá de nuevo.
        </p>
      )}
    </>
  )
}

export function SignInScreen({ inactivity }: { inactivity: boolean }) {
  return (
    <Frame>
      <h1 className="font-display text-[28px] font-extrabold leading-8">Entrá para continuar</h1>
      {inactivity && (
        <p role="status" className="rounded-xl bg-sand px-4 py-3 text-[15px] font-semibold">
          Cerramos la sesión por inactividad.
        </p>
      )}
      <p className="text-[15px] text-text-muted">Este panel es solo para cuentas habilitadas.</p>
      <GoogleButton label="Entrar con Google" selectAccount={false} />
    </Frame>
  )
}

const REASONS: Record<AccessDeniedReason, string> = {
  not_allowed: 'Cuenta no habilitada.',
  email_not_confirmed: 'Email sin confirmar.',
  no_email: 'La cuenta no tiene un email asociado.',
}

export function DeniedScreen({
  email,
  reason,
  onSwitch,
}: {
  email: string | null
  reason: AccessDeniedReason
  onSwitch: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Frame>
      <h1 className="font-display text-[28px] font-extrabold leading-8">No podés ver este panel</h1>
      <p className="text-[15px]">
        Sesión iniciada como <strong>{email ?? 'una cuenta sin email'}</strong>.
      </p>
      <p role="alert" className="rounded-xl bg-blush px-4 py-3 text-[15px] font-bold text-on-bright">
        {REASONS[reason]}
      </p>
      <Button
        variant="dark"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          // Local sign-out first, then Google's account chooser.
          onSwitch()
            .then(() => signInAdminWithGoogle(true))
            .catch(() => setBusy(false))
        }}
      >
        Entrar con otra cuenta de Google
      </Button>
    </Frame>
  )
}
