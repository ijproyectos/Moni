/** What the floating Moni says in its speech bubble. */
export const MONI_PHRASES = [
  // Ahorro y metas
  '¿Cómo van tus ahorros?',
  '¿Cómo van tus metas?',
  'Ahorrar de a poquito rinde',
  '¡Cada peso cuenta!',
  '¿Te ayudo a ahorrar?',
  'Un ahorrito hoy, tranquilidad mañana',
  '¿Ya apartaste algo este mes?',
  'Las metas se logran de a poco',
  // Registrar y revisar
  '¿Anotamos un gasto?',
  '¿En qué gastaste hoy?',
  '¿Cargamos un gasto?',
  '¿Anotamos ese cafecito?',
  '¿Te quedó algún ticket?',
  '¿Cobraste algo? Contame',
  '¿Se te escapó algún gasto?',
  '¿Revisamos tus números?',
  '¿Revisamos tus cuentas?',
  '¿Miramos tus gastos?',
  'Anotar hoy te ahorra dolores mañana',
  // Control y consejos
  'Tu plata, bajo control',
  'Tu plata, bien cuidada',
  'Los gastitos hormiga también cuentan',
  'Un presupuesto chiquito ordena todo',
  '¿Armamos un presupuesto?',
  'Mirar tus números ayuda a decidir',
  'Pensalo antes de pagar en cuotas',
  'Pagar a tiempo evita sorpresas',
  'Antes de comprar, preguntame',
  '¿Te alcanza para ese gustito?',
  '¿Llegamos bien a fin de mes?',
  'Gastar con cabeza también es ahorrar',
  // Charla y fortuna
  '¿Tenés alguna duda?',
  '¿Charlamos un rato?',
  '¿Querés un consejo?',
  '¿Necesitás una mano?',
  'Tocame y charlamos',
  'Estoy atento, che',
  'Que la fortuna te acompañe',
  'Las monedas me caen simpáticas',
  '¡Cuidemos esos pesitos!',
  'Tu gato de la fortuna presente',
] as const

/** Time from one phrase appearing to the next: 12–15 s, a little different each time (`random` is a prop to test it). */
export function nextInterval(random: () => number = Math.random): number {
  return 12_000 + Math.round(random() * 3_000)
}

/** A phrase that is not the previous one (`random` is a prop so it can be tested). */
export function nextPhrase(previous: string | null, random: () => number = Math.random): string {
  const options = MONI_PHRASES.filter((p) => p !== previous)
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))] as string
}

/**
 * The part of the cat's picture that is actually drawn (ears, paws, sides), as fractions of the picture's box: the file has
 * empty space around the cat, so the limits must follow the drawing and not the box (measured on the SVG's pixels).
 */
export const CAT_VISIBLE = { left: 252 / 1024, right: 902 / 1024, top: 29 / 1024, bottom: 939 / 1024 } as const

/**
 * Keeps the cat (top-left corner of its box) inside the area so that what is drawn is always whole on screen:
 * `edge` from the sides, the ears (also while the floating animation lifts it `lift` px) `top` from the top, and the paws
 * `bottom` from the bottom. Returns whole pixels.
 */
export function clampToArea(
  point: { x: number; y: number },
  area: { width: number; height: number },
  size: number,
  margin: { edge: number; top: number; bottom: number },
  lift = 0,
  visible: { left: number; right: number; top: number; bottom: number } = CAT_VISIBLE,
): { x: number; y: number } {
  const minX = Math.ceil(margin.edge - visible.left * size)
  const maxX = Math.floor(area.width - margin.edge - visible.right * size)
  const minY = Math.ceil(margin.top + lift - visible.top * size)
  const maxY = Math.floor(area.height - margin.bottom - visible.bottom * size)
  const lowX = Math.min(minX, maxX)
  const lowY = Math.min(minY, maxY)
  return {
    x: Math.min(Math.max(lowX, maxX), Math.max(lowX, point.x)),
    y: Math.min(Math.max(lowY, maxY), Math.max(lowY, point.y)),
  }
}
