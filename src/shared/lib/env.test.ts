import { parseEnv } from './env'

describe('parseEnv', () => {
  it('accepts a valid configuration', () => {
    const result = parseEnv({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_123',
    })
    expect(result.ok).toBe(true)
  })

  it('reports every missing or invalid variable', () => {
    const result = parseEnv({ VITE_SUPABASE_URL: 'not-a-url' })
    expect(result).toEqual({
      ok: false,
      missing: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'],
    })
  })
})
