import { BANK_CATALOG } from '@/features/accounts/domain/bankCatalog'
import { readdirSync } from 'node:fs'
import { CATALOG, SERVICE_CATEGORIES, findService, groupCatalog, searchCatalog } from './catalog'
import { logoUrl } from './logos'

const BRAND_FILES = readdirSync(`${process.cwd()}/src/assets/brands`)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.replace('.svg', ''))

describe('subscription catalog', () => {
  it('has unique ids and every service belongs to a known category', () => {
    const ids = CATALOG.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const categories = new Set(SERVICE_CATEGORIES.map((c) => c.id))
    expect(CATALOG.every((s) => categories.has(s.category) && s.name.length > 0)).toBe(true)
  })

  it('includes every service the product asked for', () => {
    const names = CATALOG.map((s) => s.name)
    for (const expected of [
      'ChatGPT',
      'Claude',
      'Gemini',
      'Perplexity',
      'Cursor',
      'Midjourney',
      'GitHub Copilot',
      'ElevenLabs',
      'Runway',
      'Suno',
      'Netflix',
      'Disney+',
      'Prime Video',
      'HBO Max',
      'Spotify',
      'YouTube Premium',
      'Apple TV+',
      'Crunchyroll',
      'iCloud+',
      'Google One',
      'Dropbox',
      'OneDrive',
      'Canva',
      'Notion',
      'Microsoft 365',
      'Adobe',
      'VPN',
      'PlayStation Plus',
      'Xbox Game Pass',
      'Nintendo Switch Online',
      'Smart Fit',
      'Megatlon',
      'SportClub',
      'Uber One',
      'Rappi Pro',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('has no catch-all membership; the gym and VPN entries stay', () => {
    const names = CATALOG.map((s) => s.name)
    expect(names).not.toContain('Otra membresía')
    expect(names).toContain('Otro gimnasio')
    expect(names).toContain('VPN')
  })

  it('every logo a service points to exists locally, and no logo file is orphaned', () => {
    // Bank and wallet logos (Medios de pago) live in the same folder.
    const used = [...CATALOG, ...BANK_CATALOG].flatMap((s) => (s.logo ? [s.logo] : []))
    for (const logo of used) {
      expect(BRAND_FILES, `missing file for ${logo}`).toContain(logo)
      expect(logoUrl(logo), `no URL for ${logo}`).toBeTruthy()
    }
    expect(BRAND_FILES.filter((f) => !used.includes(f))).toEqual([])
  })

  it('priority logos are present (ChatGPT, Disney+, Canva, Microsoft 365 and the AI tools)', () => {
    for (const id of [
      'chatgpt',
      'disney-plus',
      'canva',
      'microsoft-365',
      'claude',
      'gemini',
      'midjourney',
      'runway',
    ]) {
      expect(findService(id)?.logo, id).toBeTruthy()
    }
  })

  it('services without a logo are marked so the UI shows the generic icon', () => {
    expect(findService('smart-fit')?.logo).toBeUndefined()
    expect(logoUrl(undefined)).toBeUndefined()
    expect(logoUrl('does-not-exist')).toBeUndefined()
  })

  it('plan lists carry no prices', () => {
    for (const s of CATALOG)
      for (const plan of s.plans ?? []) expect(plan).not.toMatch(/\$|USD|ARS|\bprecio/i)
  })

  it('searches by name or category ignoring case and accents', () => {
    expect(searchCatalog('NETFLIX').map((s) => s.id)).toEqual(['netflix'])
    expect(searchCatalog('inteligencia').length).toBe(10)
    expect(searchCatalog('musica spotify').length).toBe(0)
    expect(searchCatalog('disney').map((s) => s.id)).toEqual(['disney-plus'])
    expect(searchCatalog('').length).toBe(CATALOG.length)
    expect(searchCatalog('zzzz')).toEqual([])
  })

  it('groups by category in order and leaves empty groups out', () => {
    const groups = groupCatalog(searchCatalog('netflix'))
    expect(groups.map((g) => g.category.id)).toEqual(['streaming'])
    expect(groupCatalog(CATALOG).map((g) => g.category.id)).toEqual(
      SERVICE_CATEGORIES.map((c) => c.id),
    )
  })
})
