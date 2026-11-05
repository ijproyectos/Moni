import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/features/auth/api/authContext'
import { clearReturnTo } from '@/features/auth/domain/returnTo'
import { Button } from '@/shared/ui/Button'
import { FullScreenLoader } from '@/shared/ui/FullScreenLoader'
import { signOutAdmin } from '../api/adminAuth'
import { adminApi, AdminApiError } from '../api/adminRepository'
import { useAdminQuery } from '../api/useAdminQuery'
import { useInactivityLogout } from '../api/useInactivityLogout'
import { clearLastActivity } from '../domain/inactivity'
import { ADMIN_PATH, adminPath } from '../domain/paths'
import type { AccessDeniedReason } from '../domain/types'
import { DeniedScreen, SignInScreen } from './AdminScreens'
import { IaPage } from './IaPage'
import { MpPage } from './MpPage'
import { PlusPage } from './PlusPage'
import { ResumenPage } from './ResumenPage'
import { SistemaPage } from './SistemaPage'
import { SoportePage } from './SoportePage'
import { SoporteTicketPage } from './SoporteTicketPage'
import { UsuarioPage } from './UsuarioPage'
import { UsuariosPage } from './UsuariosPage'
import { ErrorBlock } from './widgets'

const NAV = [
  { to: ADMIN_PATH, label: 'Resumen', end: true },
  { to: adminPath('usuarios'), label: 'Usuarios', end: false },
  { to: adminPath('plus'), label: 'Plus', end: false },
  { to: adminPath('soporte'), label: 'Soporte', end: false },
  { to: adminPath('ia'), label: 'IA y costos', end: false },
  { to: adminPath('mp'), label: 'Mercado Pago', end: false },
  { to: adminPath('sistema'), label: 'Sistema', end: false },
]

const DENIED_REASONS: readonly string[] = ['not_allowed', 'email_not_confirmed', 'no_email']

/** The panel is not an indexable page: keep crawlers out and set a plain title while it is mounted. */
function useNoIndex() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Moni · Admin'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => {
      document.title = previousTitle
      meta.remove()
    }
  }, [])
}

function Panel({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="font-display text-xl font-extrabold">Moni · Admin</h1>
          <div className="flex items-center gap-3">
            <span className="max-w-[40vw] truncate text-[14px] text-text-muted">{email}</span>
            <Button variant="ghost" className="min-h-10 px-3 text-[15px]" onClick={onLogout}>
              Salir
            </Button>
          </div>
        </div>
        <nav aria-label="Secciones" className="mx-auto w-full max-w-[1200px] overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-4 text-[15px] font-bold ${
                      isActive ? 'bg-forest text-cream' : 'text-ink hover:bg-sand'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1200px] px-4 py-5">
        <Routes>
          <Route index element={<ResumenPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
          <Route path="usuarios/:id" element={<UsuarioPage />} />
          <Route path="plus" element={<PlusPage />} />
          <Route path="soporte" element={<SoportePage />} />
          <Route path="soporte/:id" element={<SoporteTicketPage />} />
          <Route path="ia" element={<IaPage />} />
          <Route path="mp" element={<MpPage />} />
          <Route path="sistema" element={<SistemaPage />} />
          <Route path="*" element={<Navigate to={ADMIN_PATH} replace />} />
        </Routes>
      </main>
    </div>
  )
}

/**
 * Entry of /adminmoni (lazy chunk). The SPA enforces nothing: it asks the admin-panel function, which answers 403
 * unless the signed-in email is allowlisted. Anything but a success never renders panel data.
 */
export function AdminApp() {
  useNoIndex()
  const { session, user, isLoading } = useAuth()
  const queryClient = useQueryClient()
  const [inactivityNotice, setInactivityNotice] = useState(false)
  const signedIn = Boolean(session)

  const logout = useCallback(async () => {
    clearLastActivity()
    await signOutAdmin(queryClient)
  }, [queryClient])

  useInactivityLogout(signedIn, () => {
    setInactivityNotice(true)
    void logout()
  })

  useEffect(() => {
    // Spent: the OAuth round trip that brought the person here is over.
    if (signedIn) clearReturnTo()
  }, [signedIn])

  // The first call doubles as the access check; the Resumen page reuses its result.
  const access = useAdminQuery(['resumen'], adminApi.resumen)
  const error = access.error
  const deniedReason =
    error instanceof AdminApiError &&
    error.status === 403 &&
    error.reason &&
    DENIED_REASONS.includes(error.reason)
      ? (error.reason as AccessDeniedReason)
      : null
  const invalidSession = error instanceof AdminApiError && error.status === 401

  useEffect(() => {
    if (invalidSession) void logout()
  }, [invalidSession, logout])

  if (isLoading) return <FullScreenLoader />
  if (!session) return <SignInScreen inactivity={inactivityNotice} />
  if (access.isPending || invalidSession) return <FullScreenLoader label="Verificando acceso…" />
  if (error instanceof AdminApiError && error.status === 403) {
    return (
      <DeniedScreen
        email={user?.email ?? null}
        reason={deniedReason ?? 'not_allowed'}
        onSwitch={logout}
      />
    )
  }
  if (access.isError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-6">
        <ErrorBlock
          onRetry={() => void access.refetch()}
          message="No pudimos verificar tu acceso."
        />
      </main>
    )
  }
  return <Panel email={user?.email ?? ''} onLogout={() => void logout()} />
}
