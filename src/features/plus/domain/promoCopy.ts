import type { PlusFeature } from './entitlements'

/** The texts of each Moni Plus promo: Moni talks in first person. `mascot` names one of the existing drawings of the cat. */
export const PLUS_PROMO: Record<PlusFeature, { title: string; text: string; mascot: PromoMascot }> = {
  photo: {
    title: 'Sacá una foto y yo me encargo',
    text: 'Con Moni Plus puedo leer tus tickets y cargar tus gastos automáticamente. ¡Ahorrá tiempo!',
    mascot: 'carga-de-dinero',
  },
  voice: {
    title: 'Contame qué gastaste',
    text: 'Decime cuánto gastaste y en qué. Con Moni Plus me encargo de registrarlo por vos',
    mascot: 'carga-por-voz',
  },
  assistant: {
    title: 'Conocé a tu asistente financiero',
    text: 'Preguntame sobre tus ingresos, tus gastos o cuánto podés ahorrar. Con Moni Plus te ayudo a tomar mejores decisiones con tu plata',
    mascot: 'asistente',
  },
  groups: {
    title: 'Compartí más momentos',
    text: 'Con Moni Plus podés crear todos los grupos que quieras y organizar tus gastos con amigos, familia o pareja',
    mascot: 'gastos-en-grupo',
  },
  reminders: {
    title: 'Que ningún pago quede pendiente',
    text: 'Con Moni Plus podés enviar recordatorios de pago y organizar mejor tus gastos compartidos',
    mascot: 'notificaciones',
  },
  mercadopago: {
    title: 'Tu plata, siempre al día',
    text: 'Vinculá tu cuenta de Mercado Pago y dejá que sincronice tus movimientos automáticamente con Moni Plus',
    mascot: 'carga-de-dinero',
  },
  goals: {
    title: 'Soñemos en grande',
    text: '¿Tenés más de un sueño por cumplir? Con Moni Plus podés crear todas las metas de ahorro que quieras',
    mascot: 'metas-de-ahorro',
  },
  health: {
    title: 'Descubrí cómo están tus finanzas',
    text: 'Con Moni Plus puedo analizar tus hábitos financieros y ayudarte a descubrir qué estás haciendo bien y qué podés mejorar',
    mascot: 'analista',
  },
  trips: {
    title: 'Tu próxima aventura te espera',
    text: 'Organizá todos tus viajes, controlá tus presupuestos y disfrutá sin preocuparte tanto por los números',
    mascot: 'feliz',
  },
  recurring: {
    title: 'Que ningún pago te sorprenda',
    text: 'Con Moni Plus te ayudo a organizar tus suscripciones, controlar tus gastos fijos y anticiparte a tus próximos pagos',
    mascot: 'alerta',
  },
  ants: {
    title: 'Los pequeños gastos también cuentan',
    text: 'Te ayudo a descubrir esos pequeños gastos que, sin darte cuenta, pueden representar una gran parte de tu plata',
    mascot: 'atento',
  },
  reports: {
    title: 'Entendé mejor tus números',
    text: 'Con Moni Plus podés acceder a informes detallados, comparar tus gastos y conocer cómo evolucionan tus finanzas',
    mascot: 'informe',
  },
  smart_notices: {
    title: 'Dejá que yo te avise',
    text: 'Con Moni Plus puedo avisarte sobre próximos pagos, aumentos de precio y límites de gastos',
    mascot: 'notificaciones',
  },
  excel_import: {
    title: 'Traé tus movimientos a Moni',
    text: 'Con Moni Plus podés importar tus movimientos desde Excel sin tener que cargarlos uno por uno',
    mascot: 'carga-de-dinero',
  },
}

export type PromoMascot = 'carga-de-dinero' | 'carga-por-voz' | 'asistente' | 'gastos-en-grupo' | 'notificaciones' | 'metas-de-ahorro' | 'analista' | 'feliz' | 'alerta' | 'atento' | 'informe'
