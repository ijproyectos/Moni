import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getSupportEmail, SUSPENDED_MESSAGE } from '@/features/support/domain/support'
import { Button } from '@/shared/ui/Button'
import { signOut } from '../api/authActions'

/** What a suspended account sees instead of the app. */
export function SuspendedScreen() {
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)
  const supportEmail = getSupportEmail()

  async function leave() {
    setSigningOut(true)
    try {
      await signOut(queryClient)
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
      <p role="alert" className="font-display text-xl font-semibold">
        {SUSPENDED_MESSAGE}
      </p>
      {supportEmail && (
        <a href={`mailto:${supportEmail}`} className="text-[16px] font-bold underline">
          {supportEmail}
        </a>
      )}
      <Button variant="dark" disabled={signingOut} onClick={() => void leave()}>
        Cerrar sesión
      </Button>
    </main>
  )
}
