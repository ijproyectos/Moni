import { useState } from 'react'
import { signOut } from '@/features/auth/api/authActions'
import { useAuth } from '@/features/auth/api/authContext'
import { useProfile } from '@/features/auth/api/useProfile'
import { useUpdateProfile } from '@/features/auth/api/useUpdateProfile'
import { displayNameSchema, initialOf } from '@/features/auth/domain/profile'
import { toUserMessage } from '@/shared/lib/errors'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { PageHeader } from '@/shared/ui/PageHeader'
import { Skeleton } from '@/shared/ui/Skeleton'
import { useToast } from '@/shared/ui/toastContext'

export function ProfilePage() {
  const { user } = useAuth()
  const { data: profile, isLoading, isError } = useProfile()
  const updateProfile = useUpdateProfile()
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const saved = profile?.display_name ?? ''
  const name = draft ?? saved
  const initial = initialOf(saved, user?.email ?? '')

  async function save() {
    const parsed = displayNameSchema.safeParse(name)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisá el nombre.')
      return
    }
    setError(null)
    try {
      await updateProfile.mutateAsync(parsed.data)
      setDraft(null)
      toast.show('Nombre actualizado')
    } catch (e) {
      setError(toUserMessage(e))
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
    } catch (e) {
      toast.show(toUserMessage(e), { tone: 'error' })
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 px-4 pt-12">
      <PageHeader title="Perfil" backTo="/mas" />

      <div className="flex flex-col items-center gap-2 py-2">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            referrerPolicy="no-referrer"
            className="size-24 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-24 items-center justify-center rounded-full bg-lime font-display text-5xl font-semibold text-forest"
          >
            {initial}
          </span>
        )}
        {user?.email && <p className="text-[15px] text-text-muted">{user.email}</p>}
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : isError ? (
        <p role="alert" className="text-center text-expense">
          No pudimos cargar tu perfil.
        </p>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <label className="flex flex-col gap-1">
            <span className="font-display text-sm font-semibold uppercase tracking-wider text-text-muted">
              Nombre
            </span>
            <input
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              className="h-14 w-full rounded-full border border-cream bg-canvas px-5 text-[17px] text-forest"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
          <Button
            onClick={() => void save()}
            disabled={updateProfile.isPending || draft === null || draft.trim() === saved}
          >
            Guardar nombre
          </Button>

          <div className="flex flex-col gap-1">
            <span className="font-display text-sm font-semibold uppercase tracking-wider text-text-muted">
              Moneda
            </span>
            <p className="flex h-14 items-center rounded-full bg-sand px-5 text-[17px] text-forest">
              Peso argentino (ARS)
            </p>
          </div>
        </Card>
      )}

      <Button variant="dark" onClick={() => void handleSignOut()} disabled={isSigningOut}>
        Cerrar sesión
      </Button>
    </section>
  )
}
