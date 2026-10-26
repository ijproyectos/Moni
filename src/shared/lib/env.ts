import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export type EnvResult = { ok: true; env: Env } | { ok: false; missing: string[] }

export function parseEnv(source: Record<string, unknown>): EnvResult {
  const result = envSchema.safeParse(source)
  if (result.success) return { ok: true, env: result.data }
  const missing = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
  return { ok: false, missing }
}

export const envResult = parseEnv(import.meta.env)
