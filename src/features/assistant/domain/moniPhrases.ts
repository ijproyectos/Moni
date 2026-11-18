/** What the floating Moni says in its speech bubble. */
export const MONI_PHRASES = [
  // Preguntas para charlar
  '¿Charlamos un rato?',
  '¿Cómo viene tu plata?',
  '¿Tenés alguna duda?',
  '¿Hay algo que quieras saber?',
  '¿Querés un consejo?',
  '¿Cómo van tus metas?',
  '¿Llegamos a fin de mes?',
  '¿Revisamos tus cuentas?',
  '¿Te ayudo a ahorrar?',
  '¿Cómo andan tus números?',
  '¿Armamos un presupuesto?',
  '¿Miramos tus gastos?',
  '¿Te cuento algo útil?',
  '¿Necesitás una mano?',
  // Invitaciones a registrar
  '¿En qué gastaste hoy?',
  '¿Cuánto gastaste hoy?',
  'Contame qué compraste',
  '¿Cargamos un gasto?',
  '¿Anotamos ese cafecito?',
  '¿Te quedó algún ticket?',
  '¿Cobraste algo? Contame',
  '¿Registramos lo de hoy?',
  '¿Se te escapó algún gasto?',
  // Consejos breves y sugerencias
  'Anotar hoy te ahorra dolores mañana',
  'Los gastitos hormiga también cuentan',
  'Mirar tus números ayuda a decidir',
  'Ahorrar de a poquito rinde',
  'Antes de comprar, preguntame',
  'Un presupuesto chiquito ordena todo',
  '¿Te alcanza para ese gustito?',
  'Pensalo antes de pagar en cuotas',
  'Pagar a tiempo evita sorpresas',
  // Divertidos
  '¡Cuidemos esos pesitos!',
  '¡Hola! Acá estoy, ¿eh?',
  'Miau… ¿me hacés una pregunta?',
  '¡Tu gato de la fortuna presente!',
  'Los pesos me caen simpáticos',
  '¡Vamos que se puede!',
  'Estoy atento, che',
  '¡Tocame y charlamos!',
  'Soy todo oídos, ¿eh?',
  'Hoy me siento financiero',
] as const

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
