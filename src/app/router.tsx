import { createBrowserRouter, Navigate } from 'react-router'
import { AuthCallbackPage } from '@/features/auth/ui/AuthCallbackPage'
import {
  ONBOARDING_PATH,
  RedirectIfAuthenticated,
  RedirectIfOnboarded,
  RequireAuth,
  RequireOnboarded,
  WELCOME_PATH,
} from '@/features/auth/ui/guards'
import { AccountsPage } from '@/features/accounts/ui/AccountsPage'
import { CategoriesPage } from '@/features/categories/ui/CategoriesPage'
import { HomePage } from '@/features/dashboard/ui/HomePage'
import { GroupDetailPage } from '@/features/groups/ui/GroupDetailPage'
import { GroupsPage } from '@/features/groups/ui/GroupsPage'
import { JoinGroupPage } from '@/features/groups/ui/JoinGroupPage'
import { OnboardingPage } from '@/features/onboarding/ui/OnboardingPage'
import { WelcomePage } from '@/features/onboarding/ui/WelcomePage'
import { MorePage } from '@/features/settings/ui/MorePage'
import { ProfilePage } from '@/features/settings/ui/ProfilePage'
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
        element: <RedirectIfOnboarded />,
        children: [{ path: ONBOARDING_PATH, element: <OnboardingPage /> }],
      },
      {
        element: <RequireOnboarded />,
        children: [
          {
            element: <AppShell />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'actividad', element: <ActivityPage /> },
              { path: 'grupos', element: <GroupsPage /> },
              { path: 'grupos/:id', element: <GroupDetailPage /> },
              { path: 'unirse/:code', element: <JoinGroupPage /> },
              { path: 'mas', element: <MorePage /> },
              { path: 'cuentas', element: <AccountsPage /> },
              { path: 'categorias', element: <CategoriesPage /> },
              { path: 'perfil', element: <ProfilePage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
