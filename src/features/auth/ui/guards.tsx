import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'
import { Button } from '@/shared/ui/Button'
import { useAuth } from '../api/authContext'
import { useProfile } from '../api/useProfile'
import { clearReturnTo, peekReturnTo, rememberReturnTo } from '../domain/returnTo'

export const WELCOME_PATH = '/bienvenida'
export const ONBOARDING_PATH = '/onboarding'

export function RequireAuth() {
  const { session, isLoading } = useAuth()
  const location = useLocation()
  const signedOut = !isLoading && !session
  const target = `${location.pathname}${location.search}`

  // The OAuth round trip leaves the app, so the intended URL (e.g. an invite link) is kept in storage.
  useEffect(() => {
    if (signedOut) rememberReturnTo(target)
  }, [signedOut, target])

  if (isLoading) return <FullScreenLoader />
  if (!session) return <Navigate to={WELCOME_PATH} replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RedirectIfAuthenticated() {
  const { session, isLoading } = useAuth()

  if (isLoading) return <FullScreenLoader />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}

/** Private app routes: a person who has not finished onboarding is sent to the onboarding flow. */
export function RequireOnboarded() {
  const { data: profile, isLoading, isError, refetch } = useProfile()

  if (isLoading) return <FullScreenLoader />
  if (isError || !profile) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-4 px-6 text-center">
        <p role="alert" className="font-display text-xl font-semibold">
          No pudimos cargar tu perfil.
        </p>
        <Button onClick={() => void refetch()}>Reintentar</Button>
      </main>
    )
  }
  if (profile.onboarding_completed_at === null) return <Navigate to={ONBOARDING_PATH} replace />
  return (
    <>
      <ReturnToConsumed />
      <Outlet />
    </>
  )
}

/** The remembered post-login destination is spent once the person is inside the private app. */
function ReturnToConsumed() {
  useEffect(() => clearReturnTo(), [])
  return null
}

/** The onboarding flow itself is only for people who have not completed it. */
export function RedirectIfOnboarded() {
  const { data: profile, isLoading } = useProfile()

  if (isLoading) return <FullScreenLoader />
  if (profile?.onboarding_completed_at) return <Navigate to={peekReturnTo() ?? '/'} replace />
  return <Outlet />
}
