import { createBrowserRouter, Navigate } from 'react-router'
import { AuthCallbackPage } from '@/features/auth/ui/AuthCallbackPage'
import { RedirectIfAuthenticated, RequireAuth, WELCOME_PATH } from '@/features/auth/ui/guards'
import { HomePage } from '@/features/dashboard/ui/HomePage'
import { GroupsPage } from '@/features/groups/ui/GroupsPage'
import { WelcomePage } from '@/features/onboarding/ui/WelcomePage'
import { MorePage } from '@/features/settings/ui/MorePage'
import { ActivityPage } from '@/features/transactions/ui/ActivityPage'
import { AppShell } from './AppShell'

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: WELCOME_PATH, element: <WelcomePage /> }],
  },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'actividad', element: <ActivityPage /> },
          { path: 'grupos', element: <GroupsPage /> },
          { path: 'mas', element: <MorePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
