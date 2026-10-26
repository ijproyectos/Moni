import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'
import { useAuth } from '../api/authContext'
import { WELCOME_PATH } from './guards'

const CALLBACK_TIMEOUT_MS = 10_000

export function AuthCallbackPage() {
  const { session, isLoading } = useAuth()
  const navigate = useNavigate()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), CALLBACK_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const errorInUrl = new URLSearchParams(window.location.search).has('error')
  if (!isLoading && !session && (timedOut || errorInUrl)) {
    return <Navigate to={WELCOME_PATH} replace />
  }

  return <FullScreenLoader label="Entrando a Moni…" />
}
