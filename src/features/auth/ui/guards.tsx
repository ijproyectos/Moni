import { Navigate, Outlet, useLocation } from 'react-router'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'
import { useAuth } from '../api/authContext'

export const WELCOME_PATH = '/bienvenida'

export function RequireAuth() {
  const { session, isLoading } = useAuth()
  const location = useLocation()

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
