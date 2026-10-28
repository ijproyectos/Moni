// Maps database and network failures to short rioplatense messages that are safe to show in the UI.

const MESSAGES: Record<string, string> = {
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
  not_settlement_receiver: 'Solo quien recibe el pago puede registrarlo.',
  invalid_period: 'El período elegido no es válido. Probá con un rango de hasta 400 días.',
  budgets_owner_category_active_key: 'Esa categoría ya tiene un límite por mes.',
  invite_code_unavailable: 'No pudimos generar el código. Probá de nuevo.',
  ai_quota_exceeded:
    'Llegaste al límite de cargas con Moni por hoy. Probá mañana o cargalo a mano.',
  ai_unavailable: 'Moni no pudo entender eso ahora. Probá de nuevo en un ratito o cargalo a mano.',
  invalid_request: 'No pudimos entender ese texto. Probá con algo más corto (hasta 500 letras).',
}

const FALLBACK = 'Algo salió mal. Probá de nuevo en un rato.'

export function toUserMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return FALLBACK
  const { message, code } = error as { message?: unknown; code?: unknown }
  if (typeof message === 'string') {
    const known = Object.keys(MESSAGES).find((key) => message.includes(key))
    if (known) return MESSAGES[known] ?? FALLBACK
  }
  if (code === '23505') return 'Ya existe un elemento con ese nombre.'
  if (code === '42501') return 'No tenés permiso para hacer eso.'
  return FALLBACK
}
