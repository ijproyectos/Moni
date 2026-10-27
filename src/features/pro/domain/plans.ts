// Simulated Moni Pro offer. Prices and trial length are placeholders until billing exists.
export type ProPlanId = 'annual' | 'monthly' | 'lifetime'

export interface ProPlan {
  id: ProPlanId
  name: string
  price: string
  caption: string
  badge?: string
}

export const PRO_TRIAL_DAYS = 7

export const PRO_PLANS: readonly ProPlan[] = [
  {
    id: 'annual',
    name: 'Anual',
    price: 'US$ 29,99',
    caption: 'US$ 2,50 por mes',
    badge: 'Ahorrás 37%',
  },
  { id: 'monthly', name: 'Mensual', price: 'US$ 3,99', caption: 'Cada mes' },
  { id: 'lifetime', name: 'Para siempre', price: 'US$ 59,99', caption: 'Pago único' },
]

export const PRO_FEATURES = [
  'Conectá billeteras y bancos',
  'Cargá varios gastos hablando',
  'Escaneá tickets y resúmenes',
  'Presupuestos ilimitados',
  'Estadísticas de gastos en grupo',
  'Sin publicidad',
] as const

export function trialFooter(plan: ProPlan): string {
  if (plan.id === 'lifetime') return `Pagás una vez ${plan.price} y es tuyo para siempre.`
  const period = plan.id === 'annual' ? 'por año' : 'por mes'
  return `${PRO_TRIAL_DAYS} días gratis, después ${plan.price} ${period}.`
}
