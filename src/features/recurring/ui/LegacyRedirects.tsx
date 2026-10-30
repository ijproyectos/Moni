import { Navigate, useSearchParams } from 'react-router'

/** `/fijos` (the old "Fijos y cuotas"): subscriptions and fixed expenses moved to /recurrentes, installments to /tarjetas. */
export function LegacyFijosRedirect() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  if (tab === 'cuotas') return <Navigate to="/tarjetas?tab=cuotas" replace />
  if (tab === 'gastos-fijos') return <Navigate to="/recurrentes?tab=gastos-fijos" replace />
  return <Navigate to="/recurrentes" replace />
}
