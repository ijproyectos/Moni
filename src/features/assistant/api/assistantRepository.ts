import { z } from 'zod'
import { AiError, toAiError } from '@/features/ai/api/aiRepository'
import { assertOnline } from '@/shared/lib/offline'
import { getSupabase } from '@/shared/lib/supabase'
import type { RequestMessage } from '../domain/chat'

const replySchema = z.object({ reply: z.string().min(1) })

/**
 * Asks Moni. Needs a connection (offline raises OfflineError before any request). HTTP 402 / `plus_required` becomes
 * a PlusRequiredError (the Plus upsell); every other failure becomes an AiError with the server's short code.
 */
export async function askAssistant(messages: RequestMessage[]): Promise<string> {
  assertOnline()
  const { data, error } = await getSupabase().functions.invoke('insights-chat', {
    body: { messages },
  })
  if (error) throw await toAiError(error)
  const parsed = replySchema.safeParse(data)
  if (!parsed.success) throw new AiError('ai_unavailable')
  return parsed.data.reply
}
