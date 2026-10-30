import { FunctionsHttpError } from '@supabase/supabase-js'
import { assertOnline } from '@/shared/lib/offline'
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

/**
 * Sends ONE downscaled receipt photo (base64 JPEG) to parse-receipt. The function replies with the same draft
 * shape as parse-movements (a single expense); nothing is saved here and the image is never stored server-side.
 * Needs a connection (no write queue): offline raises OfflineError before any request.
 */
export async function parseReceipt(
  image: { base64: string; mediaType: string },
  today: string,
  signal?: AbortSignal,
): Promise<ParseResponse> {
  assertOnline()
  const { data, error } = await getSupabase().functions.invoke('parse-receipt', {
    body: { image: image.base64, mediaType: image.mediaType, today },
    signal,
  })
  if (error) {
    if (signal?.aborted) throw new AiError('cancelled')
    throw new AiError(
      error instanceof FunctionsHttpError ? await codeFromHttpError(error) : 'ai_unavailable',
    )
  }
  const parsed = parseResponseSchema.safeParse(data)
  if (!parsed.success || parsed.data.movements.length === 0) throw new AiError('ai_unavailable')
  return parsed.data
}
