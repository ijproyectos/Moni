export type ServiceCategoryId =
  'ai' | 'streaming' | 'storage' | 'productivity' | 'gaming' | 'health' | 'memberships'

export interface ServiceCategory {
  id: ServiceCategoryId
  label: string
}

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  { id: 'ai', label: 'Inteligencia artificial' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'storage', label: 'Almacenamiento' },
  { id: 'productivity', label: 'Productividad' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'health', label: 'Salud y deporte' },
  { id: 'memberships', label: 'Membresías' },
]

export interface CatalogService {
  /** Stable identifier, saved with the subscription. */
  id: string
  name: string
  category: ServiceCategoryId
  /** File name (without extension) in src/assets/brands; absent = generic icon. */
  logo?: string
  /**
   * Usual plan names, WITHOUT prices: the person types what they really pay in pesos. They come from the
   * services' public plan names and have not been checked against each provider, so the screen calls them
   * "planes habituales". Leave empty when unsure; the plan can always be typed.
   */
  plans?: readonly string[]
}

const s = (
  id: string,
  name: string,
  category: ServiceCategoryId,
  logo?: string,
  plans?: readonly string[],
): CatalogService => ({ id, name, category, logo, plans })

export const CATALOG: readonly CatalogService[] = [
  // Inteligencia artificial
  s('chatgpt', 'ChatGPT', 'ai', 'chatgpt', ['Plus', 'Pro']),
  s('claude', 'Claude', 'ai', 'claude', ['Pro', 'Max']),
  s('gemini', 'Gemini', 'ai', 'gemini', ['Google AI Pro', 'Google AI Ultra']),
  s('perplexity', 'Perplexity', 'ai', 'perplexity', ['Pro', 'Max']),
  s('cursor', 'Cursor', 'ai', 'cursor', ['Pro', 'Ultra']),
  s('midjourney', 'Midjourney', 'ai', 'midjourney', ['Basic', 'Standard', 'Pro', 'Mega']),
  s('github-copilot', 'GitHub Copilot', 'ai', 'copilot', ['Pro', 'Pro+']),
  s('elevenlabs', 'ElevenLabs', 'ai', 'elevenlabs', ['Starter', 'Creator', 'Pro']),
  s('runway', 'Runway', 'ai', 'runway', ['Standard', 'Pro', 'Unlimited']),
  s('suno', 'Suno', 'ai', 'suno', ['Pro', 'Premier']),
  // Streaming
  s('netflix', 'Netflix', 'streaming', 'netflix', ['Con anuncios', 'Estándar', 'Premium']),
  s('disney-plus', 'Disney+', 'streaming', 'disneyplus', ['Estándar', 'Premium']),
  s('prime-video', 'Prime Video', 'streaming', 'primevideo'),
  s('hbo-max', 'HBO Max', 'streaming', 'hbomax'),
  s('spotify', 'Spotify', 'streaming', 'spotify', ['Individual', 'Duo', 'Familiar', 'Estudiantes']),
  s('youtube-premium', 'YouTube Premium', 'streaming', 'youtube', [
    'Individual',
    'Familiar',
    'Estudiantes',
  ]),
  s('apple-tv', 'Apple TV+', 'streaming', 'appletv'),
  s('crunchyroll', 'Crunchyroll', 'streaming', 'crunchyroll'),
  // Almacenamiento
  s('icloud', 'iCloud+', 'storage', 'icloud', ['50 GB', '200 GB', '2 TB']),
  s('google-one', 'Google One', 'storage', 'googleone', ['100 GB', '200 GB', '2 TB']),
  s('dropbox', 'Dropbox', 'storage', 'dropbox', ['Plus', 'Essentials']),
  s('onedrive', 'OneDrive', 'storage', 'onedrive'),
  // Productividad
  s('canva', 'Canva', 'productivity', 'canva', ['Pro', 'Teams']),
  s('notion', 'Notion', 'productivity', 'notion', ['Plus', 'Business']),
  s('microsoft-365', 'Microsoft 365', 'productivity', 'microsoft365', ['Personal', 'Familia']),
  s('adobe', 'Adobe', 'productivity', 'adobe'),
  s('nordvpn', 'NordVPN', 'productivity', 'nordvpn'),
  s('vpn', 'VPN', 'productivity'),
  // Gaming
  s('playstation-plus', 'PlayStation Plus', 'gaming', 'playstation', [
    'Essential',
    'Extra',
    'Premium',
  ]),
  s('xbox-game-pass', 'Xbox Game Pass', 'gaming', 'xbox'),
  s('nintendo-switch-online', 'Nintendo Switch Online', 'gaming', 'nintendo'),
  // Salud y deporte
  s('smart-fit', 'Smart Fit', 'health'),
  s('megatlon', 'Megatlon', 'health'),
  s('sportclub', 'SportClub', 'health'),
  s('gimnasio', 'Otro gimnasio', 'health'),
  // Membresías
  s('uber-one', 'Uber One', 'memberships', 'uber'),
  s('rappi-pro', 'Rappi Pro', 'memberships', 'rappi'),
  s('membresia', 'Otra membresía', 'memberships'),
]

export const CUSTOM_SERVICE_ID = 'custom'

const BY_ID = new Map(CATALOG.map((service) => [service.id, service]))

export function findService(id: string): CatalogService | undefined {
  return BY_ID.get(id)
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, '')
    .trim()

/** Catalog services whose name (accent- and case-insensitive) or category contains the text. */
export function searchCatalog(query: string): CatalogService[] {
  const needle = normalize(query)
  if (!needle) return [...CATALOG]
  const labels = new Map(SERVICE_CATEGORIES.map((c) => [c.id, normalize(c.label)]))
  return CATALOG.filter(
    (service) =>
      normalize(service.name).includes(needle) ||
      (labels.get(service.category) ?? '').includes(needle),
  )
}

export interface CatalogGroup {
  category: ServiceCategory
  services: CatalogService[]
}

/** Services grouped by category in catalog order; empty groups are left out. */
export function groupCatalog(services: readonly CatalogService[]): CatalogGroup[] {
  return SERVICE_CATEGORIES.map((category) => ({
    category,
    services: services.filter((service) => service.category === category.id),
  })).filter((group) => group.services.length > 0)
}

/** Expense-category names that suit each kind of service, to preselect one (the person can change it). */
export const CATEGORY_HINTS: Record<ServiceCategoryId, readonly string[]> = {
  ai: ['suscripciones', 'tecnología', 'tecnologia', 'trabajo'],
  streaming: ['suscripciones', 'entretenimiento', 'ocio', 'salidas'],
  storage: ['suscripciones', 'tecnología', 'tecnologia'],
  productivity: ['suscripciones', 'trabajo', 'tecnología', 'tecnologia'],
  gaming: ['entretenimiento', 'ocio', 'suscripciones'],
  health: ['salud', 'deporte', 'gimnasio'],
  memberships: ['suscripciones', 'transporte', 'comida'],
}
