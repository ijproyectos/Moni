import { FunctionsHttpError } from '@supabase/supabase-js'
import { getSupabase } from '@/shared/lib/supabase'
import { parseResponseSchema, type ParseResponse } from '../domain/draft'

/** Carries the Edge Function error code ("ai_quota_exceeded", ...) so `toUserMessage` can map it. */
export class AiError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'AiError'
  }
}

async function codeFromHttpError(error: FunctionsHttpError): Promise<string> {
  try {
    const body: unknown = await (error.context as Response).json()
    const code = (body as { error?: unknown } | null)?.error
    if (typeof code === 'string' && code !== '') return code
  } catch {
    // Body was not JSON: fall through.
  }
  return 'ai_unavailable'
}

/** Sends only the final transcript text. The function replies with a draft; nothing is saved here. */
export async function parseMovements(text: string, today: string): Promise<ParseResponse> {
  const { data, error } = await getSupabase().functions.invoke('parse-movements', {
    body: { text, today },
  })
  if (error) {
    throw new AiError(
      error instanceof FunctionsHttpError ? await codeFromHttpError(error) : 'ai_unavailable',
    )
  }
  const parsed = parseResponseSchema.safeParse(data)
  if (!parsed.success) throw new AiError('ai_unavailable')
  return parsed.data
}
