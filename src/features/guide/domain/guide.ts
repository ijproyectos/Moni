/** One stop of the guided tour: a real screen, the real element to highlight on it, and what to say. */
export interface GuideStep {
  id: 'inicio' | 'cargar' | 'agente' | 'grupos' | 'cuentas' | 'explorar' | 'perfil'
  /** The screen the tour opens for this step. */
  path: string
  /** CSS selectors of the real element to highlight, best first: the first one that is on screen is used. */
  targets: readonly string[]
  title: string
  text: string
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    id: 'inicio',
    path: '/',
    targets: ['section[aria-labelledby="hero-title"]', 'main h1'],
    title: 'Inicio',
    text: 'Acá ves tu plata disponible y, más abajo, tus últimos movimientos. Tocá uno para ver su detalle.',
  },
  {
    id: 'cargar',
    path: '/',
    targets: ['section[aria-label="Cargar un movimiento"]'],
    title: 'Cargá tus movimientos',
    text: 'Subí una foto de tu ticket, usá tu voz o cargá tus ingresos y gastos manualmente. Elegí la forma que más cómoda te resulte para llevar tus finanzas al día.',
  },
  {
    id: 'agente',
    path: '/',
    targets: ['button[aria-label="Hablá con Moni"]'],
    title: 'Tu asistente financiero',
    text: 'Moni está para ayudarte a entender y mejorar tus finanzas. Preguntale sobre tus ingresos, tus gastos, cuánto podés ahorrar o pedile ayuda antes de tomar una decisión. ¡También podés moverlo por la pantalla!',
  },
  {
    id: 'grupos',
    path: '/grupos',
    targets: ['main button[aria-label="Ver lo que te deben"]', 'main a[href="/grupos/unirse"]', 'main h1'],
    title: 'Grupos',
    text: 'Mirá cuánto te deben y cuánto debés. Podés crear un grupo o entrar con un código para dividir gastos con tu pareja, familia o amigos.',
  },
  {
    id: 'cuentas',
    path: '/cuentas',
    targets: ['main [aria-label^="Abrir "]', 'main [aria-label="Medios, tarjetas o cuotas"]', 'main h1'],
    title: 'Cuentas',
    text: 'Tus medios de pago con sus saldos: efectivo, bancos y tarjetas. Tocá uno para ver su detalle y sus movimientos.',
  },
  {
    id: 'explorar',
    path: '/mas',
    targets: ['main a[href="/metas"]', 'main h1'],
    title: 'Explorar',
    text: 'Acá están Metas, Ahorros, Viajes, Informes y otras herramientas. Entrá a la que necesites cuando quieras.',
  },
  {
    id: 'perfil',
    path: '/perfil',
    targets: ['main [data-guide="profile-group"]', 'main h1', 'main h2'],
    title: 'Tu perfil',
    text: 'Personalizá Moni a tu manera. Desde tu perfil podés modificar tus datos, actualizar tus objetivos, descubrir tus logros y administrar las preferencias de tu cuenta. Si necesitás ayuda, siempre podés volver a recorrer esta guía desde Configuración.',
  },
]

const pendingKey = (userId: string) => `moni:guide-pending:${userId}`
const doneKey = (userId: string) => `moni:guide-done:${userId}`

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the guide may show again, nothing else is lost.
  }
}

/** Called when a NEW person finishes the onboarding: the tour opens the first time they enter the app. */
export function markGuidePending(userId: string) {
  if (read(doneKey(userId)) === null) write(pendingKey(userId), '1')
}

/** Only people who just finished the onboarding see it by themselves: everyone who was already in Moni is left alone. */
export function shouldAutoShowGuide(userId: string): boolean {
  return read(pendingKey(userId)) === '1' && read(doneKey(userId)) === null
}

export function markGuideDone(userId: string) {
  write(pendingKey(userId), null)
  write(doneKey(userId), '1')
}
