import type { ReactElement } from 'react'
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
import { MonthReportPage } from '@/features/dashboard/ui/MonthReportPage'
import { IncomeByMonthPage } from '@/features/dashboard/ui/IncomeByMonthPage'
import { YearReportPage } from '@/features/dashboard/ui/YearReportPage'
import { AssistantPage } from '@/features/assistant/ui/AssistantPage'
import { AntsPage } from '@/features/insights/ui/AntsPage'
import { WeeklyDigestPage } from '@/features/insights/ui/WeeklyDigestPage'
import { NotificationsPage } from '@/features/notifications/ui/NotificationsPage'
import { ProPage } from '@/features/pro/ui/ProPage'
import { ReferralPage } from '@/features/pro/ui/ReferralPage'
import {
  AguinaldoDonePage,
  AguinaldoPage,
  AguinaldoSplitPage,
} from '@/features/aguinaldo/ui/AguinaldoPages'
import { DebtsPage } from '@/features/notifications/ui/DebtsPage'
import {
  LegacyFijosRedirect,
  LegacyTarjetasRedirect,
} from '@/features/recurring/ui/LegacyRedirects'
import { RecurringPage } from '@/features/recurring/ui/RecurringPage'
import { GoalDetailPage } from '@/features/goals/ui/GoalDetailPage'
import { GoalsPage } from '@/features/goals/ui/GoalsPage'
import { InstallmentsPage } from '@/features/goals/ui/InstallmentsPage'
import { GroupDetailPage } from '@/features/groups/ui/GroupDetailPage'
import { GroupsPage } from '@/features/groups/ui/GroupsPage'
import { CreateGroupPage } from '@/features/groups/ui/CreateGroupPage'
import {
  GroupSummaryPage,
  NoticesSentPage,
  ShareSummaryPage,
} from '@/features/groups/ui/GroupSummaryPages'
import {
  GroupLinkLandingPage,
  JoinGroupPage,
  JoinWithCodePage,
} from '@/features/groups/ui/JoinGroupPage'
import { PeoplePage } from '@/features/groups/ui/PeoplePage'
import { SoloTripPage, TripsPage } from '@/features/trips/ui/TripsPages'
import { OnboardingPage } from '@/features/onboarding/ui/OnboardingPage'
import { WelcomePage } from '@/features/onboarding/ui/WelcomePage'
import { MorePage } from '@/features/settings/ui/MorePage'
import { ProfilePage } from '@/features/settings/ui/ProfilePage'
import { ActivityPage } from '@/features/transactions/ui/ActivityPage'
import type { FeatureFlag } from '@/shared/config/features'
import { AppShell } from './AppShell'
import { FeatureGate } from './FeatureGate'

/** Wraps a screen so it is only reachable while its flag is on (otherwise it redirects home). */
function gated(flag: FeatureFlag, element: ReactElement) {
  return <FeatureGate flag={flag}>{element}</FeatureGate>
}

/** Screens backed by simulated data (no Supabase yet); the flagged ones redirect home while off. */
const simulatedRoutes = [
  { path: 'metas', element: <GoalsPage /> },
  { path: 'metas/cuotas', element: <InstallmentsPage /> },
  { path: 'metas/:id', element: <GoalDetailPage /> },
  { path: 'hormigas', element: <AntsPage /> },
  { path: 'hormigas/aviso-semanal', element: gated('weeklyDigest', <WeeklyDigestPage />) },
  { path: 'avisos', element: gated('notifications', <NotificationsPage />) },
  { path: 'pro', element: gated('pro', <ProPage />) },
  { path: 'recomendar', element: gated('referral', <ReferralPage />) },
  { path: 'deudas', element: gated('debts', <DebtsPage />) },
  { path: 'aguinaldo', element: gated('aguinaldo', <AguinaldoPage />) },
  { path: 'aguinaldo/reparto', element: gated('aguinaldo', <AguinaldoSplitPage />) },
  { path: 'aguinaldo/listo', element: gated('aguinaldo', <AguinaldoDonePage />) },
  { path: 'recurrentes', element: <RecurringPage /> },
  { path: 'fijos', element: <LegacyFijosRedirect /> },
  // Old standalone credit-card screen: now Medios de pago (Tarjetas / Cuotas tabs).
  { path: 'tarjetas', element: <LegacyTarjetasRedirect /> },
]

/** Everything inside the app shell (private routes). */
export const appRoutes = [
  { index: true, element: <HomePage /> },
  { path: 'actividad', element: <ActivityPage /> },
  { path: 'grupos', element: <GroupsPage /> },
  { path: 'grupos/nuevo', element: <CreateGroupPage /> },
  { path: 'grupos/unirse', element: <JoinWithCodePage /> },
  { path: 'grupos/:id', element: <GroupDetailPage /> },
  { path: 'grupos/:id/personas', element: <PeoplePage /> },
  { path: 'grupos/:id/resumen', element: <GroupSummaryPage /> },
  { path: 'grupos/:id/compartir', element: <ShareSummaryPage /> },
  { path: 'grupos/:id/avisados', element: <NoticesSentPage /> },
  { path: 'viajes', element: <TripsPage /> },
  { path: 'viajes/:id', element: gated('soloTrips', <SoloTripPage />) },
  { path: 'unirse/:code', element: <JoinGroupPage /> },
  { path: 'mas', element: <MorePage /> },
  { path: 'cuentas', element: <AccountsPage /> },
  { path: 'categorias', element: <CategoriesPage /> },
  { path: 'perfil', element: <ProfilePage /> },
  { path: 'este-mes', element: <MonthReportPage /> },
  { path: 'tu-anio', element: <YearReportPage /> },
  { path: 'ingresos', element: <IncomeByMonthPage /> },
  { path: 'informes/asistente', element: <AssistantPage /> },
  ...simulatedRoutes,
]

export const router = createBrowserRouter([
  {
    element: <RedirectIfAuthenticated />,
    children: [{ path: WELCOME_PATH, element: <WelcomePage /> }],
  },
  { path: '/auth/callback', element: <AuthCallbackPage /> },
  // Public: what someone without Moni sees when they open a group link (screen 127).
  { path: '/g/:code', element: <GroupLinkLandingPage /> },
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
            children: appRoutes,
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
