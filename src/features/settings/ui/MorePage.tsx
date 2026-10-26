import { useState } from 'react'
import { signOut } from '@/features/auth/api/authActions'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { Button } from '@/shared/ui/Button'

export function MorePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const displayName = profile?.display_name ?? user?.email ?? ''
  const initial = displayName.trim().charAt(0).toUpperCase()

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 px-5 pt-14">
      <div className="flex items-center gap-4 rounded-2xl bg-forest p-5 text-cream">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            referrerPolicy="no-referrer"
            className="size-[72px] rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-[72px] items-center justify-center rounded-full bg-lime font-display text-3xl font-semibold text-forest"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <p className="text-text-muted-on-dark">Cargando perfil…</p>
          ) : isError ? (
            <p className="text-blush">No pudimos cargar tu perfil.</p>
          ) : (
            <p className="truncate font-display text-2xl font-semibold">{displayName}</p>
          )}
        </div>
      </div>

      <Button variant="dark" onClick={handleSignOut} disabled={isSigningOut}>
        Cerrar sesión
      </Button>
    </section>
  )
}
