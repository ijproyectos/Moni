// Maps database and network failures to short rioplatense messages that are safe to show in the UI.

import { OfflineError, OFFLINE_MESSAGE } from './offline'

/**
 * The action needs Moni Plus (free plan). Raised from the database RPCs (`plus_required`, SQLSTATE 54000) and from
 * the AI Edge Functions (HTTP 402 with `{ error: 'plus_required' }`). The UI turns it into the Plus upsell; the
 * server is the source of truth, the client gate is only UX.
 */
export class PlusRequiredError extends Error {
  constructor() {
    super('plus_required')
    this.name = 'PlusRequiredError'
  }
}

export const PLUS_REQUIRED_CODE = 'plus_required'

/** True for a PlusRequiredError or any error whose message carries the `plus_required` marker. */
export function isPlusRequired(error: unknown): boolean {
  if (error instanceof PlusRequiredError) return true
  if (typeof error !== 'object' || error === null) return false
  const { message } = error as { message?: unknown }
  return typeof message === 'string' && message.includes(PLUS_REQUIRED_CODE)
}

/** Converts a PostgREST error carrying `plus_required` into a PlusRequiredError; any other error passes through. */
export function mapPlusRequired<T>(error: T): T | PlusRequiredError {
  return isPlusRequired(error) ? new PlusRequiredError() : error
}

const MESSAGES: Record<string, string> = {
  plus_required: 'Esto es parte de Moni Plus. Con un código de acceso lo activás en un toque.',
  already_subscribed: 'Ya tenés una suscripción activa a Moni Plus.',
  too_many_requests: 'Esperá un minuto antes de intentar de nuevo.',
  action_throttled: 'Esperá unos segundos antes de hacer otro cambio en tu suscripción.',
  payment_provider_unavailable:
    'Mercado Pago no responde en este momento. Probá de nuevo en un ratito.',
  payment_provider_error: 'No pudimos iniciar el pago con Mercado Pago. Probá de nuevo en un rato.',
  server_misconfigured: 'El pago con Mercado Pago no está disponible por ahora.',
  consent_required: 'Para vincular Mercado Pago tenés que aceptar el aviso de datos.',
  rate_limited: 'Ya sincronizaste hace poco. Probá de nuevo en unos minutos.',
  needs_reconnect: 'Hay que volver a vincular tu cuenta de Mercado Pago para seguir importando.',
  not_connected: 'No tenés Mercado Pago vinculado.',
  not_active: 'La importación de Mercado Pago está en pausa. Probá de nuevo en un rato.',
  mp_import_unavailable: 'No pudimos conectar con Mercado Pago. Probá de nuevo en un rato.',
  billing_unavailable: 'No pudimos conectar con tu suscripción. Probá de nuevo en un rato.',
  email_required: 'Tu cuenta necesita un email para suscribirse.',
  promo_invalid: 'Ese código no es válido. Revisalo y probá de nuevo.',
  promo_already_used: 'Ya usaste ese código y su período terminó.',
  account_not_found: 'La cuenta elegida no existe.',
  category_not_found: 'La categoría elegida no existe.',
  category_kind_mismatch: 'La categoría no corresponde al tipo de movimiento.',
  category_archived: 'Esa categoría está archivada. Elegí otra.',
  account_archived: 'No podés cargar movimientos en una cuenta archivada.',
  voided_row_is_immutable: 'Este movimiento está anulado y ya no se puede modificar.',
  not_authenticated: 'Tu sesión venció. Volvé a ingresar.',
  not_group_member: 'No sos parte de este grupo.',
  group_archived: 'Este grupo está archivado.',
  invalid_group_name: 'Ponele un nombre al grupo (hasta 60 caracteres).',
  invalid_group_kind: 'Elegí un tipo de grupo válido.',
  invite_limit_reached: 'Ya hay 5 invitaciones activas. Anulá una o esperá a que venza.',
  invite_invalid: 'Ese código no es válido o la invitación ya no está disponible. Pedí una nueva.',
  too_many_attempts: 'Demasiados intentos fallidos. Probá de nuevo en una hora.',
  invite_expired: 'Esa invitación venció. Pedí una nueva.',
  invite_revoked: 'Esa invitación fue anulada. Pedí una nueva.',
  invite_exhausted: 'Esa invitación ya se usó el máximo de veces. Pedí una nueva.',
  balance_not_zero:
    'No podés salir del grupo mientras tengas saldo pendiente. Saldá las cuentas primero.',
  invalid_amount: 'Ingresá un monto válido mayor a cero.',
  invalid_description: 'Escribí una descripción de hasta 120 caracteres.',
  template_not_found: 'La categoría elegida no existe.',
  invalid_split_method: 'Elegí cómo dividir el gasto.',
  invalid_participants: 'Elegí al menos una persona para dividir el gasto, sin repetidos.',
  participant_not_member: 'Todas las personas elegidas tienen que ser parte del grupo.',
  payer_not_member: 'Quien pagó tiene que ser parte del grupo.',
  percents_must_sum_100: 'Los porcentajes tienen que sumar 100.',
  invalid_percent: 'Revisá los porcentajes: tienen que ser mayores a cero y con hasta 2 decimales.',
  payer_account_requires_payer: 'Solo quien pagó puede descontar el gasto de su cuenta.',
  split_mismatch: 'La división no coincide con el monto. Probá de nuevo.',
  expense_not_found: 'El gasto compartido no existe.',
  settlement_not_found: 'La compensación no existe.',
  not_allowed: 'No tenés permiso para hacer eso.',
  participant_left: 'No se puede anular: alguien que participó ya salió del grupo.',
  invalid_settlement_target: 'Elegí a otra persona del grupo para saldar.',
  invalid_note: 'La nota puede tener hasta 200 caracteres.',
  no_debt: 'Esa deuda ya no está pendiente. Actualizá la pantalla.',
  reminder_too_soon: 'Ya le recordaste este pago hoy. Probá de nuevo mañana.',
  report_already_open: 'Ya informaste este pago: esperá a que lo confirmen.',
  debt_already_settled: 'Esa deuda ya estaba saldada: no registramos nada de más.',
  report_not_open: 'Este pago ya fue resuelto.',
  report_not_found: 'No encontramos ese pago.',
  invalid_transfer_data: 'Los datos para transferir no son válidos. Revisá el alias o el CBU/CVU.',
  not_settlement_receiver: 'Solo quien recibe el pago puede registrarlo.',
  invalid_period: 'El período elegido no es válido. Probá con un rango de hasta 400 días.',
  budgets_owner_category_active_key: 'Esa categoría ya tiene un límite por mes.',
  invite_code_unavailable: 'No pudimos generar el código. Probá de nuevo.',
  profile_not_found: 'No encontramos tu perfil. Cerrá sesión y volvé a entrar.',
  no_categories: 'Elegí al menos una categoría.',
  too_many_goals: 'Elegí hasta 10 objetivos.',
  invalid_goal: 'Revisá los objetivos elegidos.',
  invalid_currency: 'Esa moneda todavía no está disponible.',
  invalid_custom_category: 'Revisá las categorías que creaste: nombre, ícono y color.',
  invalid_custom_categories: 'Podés crear hasta 20 categorías en este paso.',
  invalid_installments: 'Elegí entre 2 y 60 cuotas.',
  invalid_installment_number:
    'La cuota en la que vas tiene que estar entre 1 y el total de cuotas.',
  not_a_credit_card: 'Elegí una tarjeta de crédito.',
  card_not_configured: 'Cargá el día de cierre y de vencimiento de la tarjeta para usar cuotas.',
  invalid_statement:
    'Ese resumen no es válido para esta tarjeta. Elegí uno cercano a la fecha de compra.',
  invalid_date: 'La fecha no es válida.',
  not_enough_free_money:
    'No alcanza el dinero libre de esa cuenta. Bajá el importe o liberá parte de otra reserva.',
  withdraw_exceeds_reserve: 'La meta no tiene tanto dinero reservado.',
  goal_not_found: 'No encontramos esa meta.',
  goal_archived: 'La meta está archivada. Reactivala para usarla.',
  goal_not_active: 'La meta tiene que estar activa para sumarle dinero.',
  release_required: 'Para archivar la meta hay que liberar el dinero reservado.',
  reserve_would_be_negative: 'Ese aporte ya se retiró en parte: no se puede anular.',
  invalid_savings_account: 'Las metas se guardan en efectivo, bancos o billeteras, no en tarjetas.',
  invalid_frequency: 'Elegí cada cuánto querés ahorrar.',
  movement_not_found: 'No encontramos ese movimiento.',
  fixed_expense_not_found: 'No encontramos ese gasto fijo.',
  fixed_expense_removed: 'Reactivá el seguimiento para poder editarlo.',
  occurrence_not_found: 'No encontramos ese vencimiento.',
  payment_not_found: 'No encontramos ese pago.',
  already_resolved: 'Ese vencimiento ya fue resuelto. Actualizá la pantalla.',
  invalid_status: 'Ese estado no es válido.',
  invalid_transition: 'Ese cambio no se puede hacer en el estado actual.',
  subscription_not_found: 'No encontramos esa suscripción.',
  subscription_cancelled: 'Reactivá la suscripción para poder editarla.',
  charge_not_found: 'No encontramos ese cobro.',
  invalid_link: 'Ese gasto no se puede vincular a este cobro.',
  invalid_opening_source: 'Elegí de dónde viene esa plata.',
  invalid_opening_kind: 'Esta opción no está disponible para ese tipo de cuenta.',
  nothing_to_classify: 'Este medio no tiene un saldo inicial para clasificar.',
  category_required: 'Elegí una categoría para el ingreso.',
  plan_not_found: 'La compra en cuotas no existe o ya está anulada.',
  installment_managed_by_plan: 'Las cuotas se anulan desde la compra completa.',
  ai_quota_exceeded:
    'Llegaste al límite de cargas con Moni por hoy. Probá mañana o cargalo a mano.',
  ai_unavailable: 'Moni no pudo entender eso ahora. Probá de nuevo en un ratito o cargalo a mano.',
  invalid_request: 'No pudimos entender ese texto. Probá con algo más corto (hasta 500 letras).',
  unsupported_currency: 'Por ahora Moni solo lee facturas en pesos argentinos. Cargalo a mano.',
  receipt_unreadable:
    'No pudimos leer el total de la factura. Probá con otra foto, de cerca y con buena luz, o cargalo a mano.',
  invalid_image: 'Esa imagen no se puede usar. Probá con una foto en JPG, PNG o WEBP.',
  image_too_large: 'La foto es demasiado pesada. Probá con otra.',
  image_not_readable: 'No pudimos abrir esa foto. Probá con otra.',
}

const CONSTRAINT_MESSAGES: Record<string, string> = {
  accounts_opening_balance_check:
    'El saldo inicial no es válido para este tipo de cuenta: una tarjeta empieza con deuda y las demás con saldo cero o más.',
  accounts_kind_check: 'Elegí un tipo de cuenta válido.',
}

const FALLBACK = 'Algo salió mal. Probá de nuevo en un rato.'

export function toUserMessage(error: unknown): string {
  if (error instanceof OfflineError) return OFFLINE_MESSAGE
  if (typeof error !== 'object' || error === null) return FALLBACK
  const { message, code } = error as { message?: unknown; code?: unknown }
  if (typeof message === 'string') {
    const known = Object.keys(MESSAGES).find((key) => message.includes(key))
    if (known) return MESSAGES[known] ?? FALLBACK
  }
  if (typeof message === 'string') {
    const constraint = Object.keys(CONSTRAINT_MESSAGES).find((key) => message.includes(key))
    if (constraint) return CONSTRAINT_MESSAGES[constraint] ?? FALLBACK
  }
  if (code === '23505') return 'Ya existe un elemento con ese nombre.'
  if (code === '42501') return 'No tenés permiso para hacer eso.'
  // PostgREST: the function the screen calls is not in the database yet (its migration has not been applied).
  if (code === 'PGRST202') {
    return 'Esta sección todavía no está habilitada en la base de datos: falta aplicar su migración.'
  }
  return FALLBACK
}
