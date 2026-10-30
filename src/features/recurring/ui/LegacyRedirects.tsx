import { Navigate, useSearchParams } from 'react-router'

/** `/fijos` (the old "Fijos y cuotas"): subscriptions and fixed expenses moved to /recurrentes, installments to Medios de pago › Cuotas. */
export function LegacyFijosRedirect() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  if (tab === 'cuotas') return <Navigate to="/cuentas?tab=cuotas" replace />
  if (tab === 'gastos-fijos') return <Navigate to="/recurrentes?tab=gastos-fijos" replace />
  return <Navigate to="/recurrentes" replace />
}

/** `/tarjetas` (the old "Tarjetas de crédito" screen) now lives inside Medios de pago, keeping its two tabs. */
export function LegacyTarjetasRedirect() {
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'cuotas' ? 'cuotas' : 'tarjetas'
  return <Navigate to={`/cuentas?tab=${tab}`} replace />
}
