import { AiError } from '@/features/ai/api/aiRepository'
import { toUserMessage } from '@/shared/lib/errors'

/** Mirrors the limits enforced by the insights-chat Edge Function (the server validates them again). */
export const ASSISTANT_LIMITS = {
  maxMessages: 12,
  maxChars: 1_000,
} as const

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface RequestMessage {
  role: 'user' | 'assistant'
  content: string
}

export const SUGGESTIONS = [
  '¿Cuánto gasté este mes?',
  '¿Qué vence esta semana?',
  '¿Cuáles son mis gastos hormiga?',
  '¿Cuánto debo en cuotas?',
  '¿Quién me debe en mis grupos?',
] as const

export function normalizeQuestion(text: string): string {
  return text.trim()
}

/** True when the text can be sent: not empty and within the character cap. */
export function isSendable(text: string): boolean {
  const length = Array.from(normalizeQuestion(text)).length
  return length > 0 && length <= ASSISTANT_LIMITS.maxChars
}

function truncate(text: string): string {
  const chars = Array.from(text)
  return chars.length > ASSISTANT_LIMITS.maxChars
    ? `${chars.slice(0, ASSISTANT_LIMITS.maxChars - 1).join('')}…`
    : text
}

/**
 * The conversation as the function expects it: the last 12 messages, each cut to 1000 chars (a long reply is only
 * context), starting with a user message. The server requires the last one to be from the user.
 */
export function toRequestMessages(history: readonly ChatMessage[]): RequestMessage[] {
  const recent = history
    .slice(-ASSISTANT_LIMITS.maxMessages)
    .map((m) => ({ role: m.role, content: truncate(m.content) }))
  const firstUser = recent.findIndex((m) => m.role === 'user')
  return firstUser === -1 ? [] : recent.slice(firstUser)
}

/** Short rioplatense message for a failed assistant call (never raw server text). */
export function assistantErrorMessage(error: unknown): string {
  if (error instanceof AiError) {
    switch (error.code) {
      case 'ai_quota_exceeded':
        return 'Llegaste al límite de preguntas a Moni por hoy. Probá mañana.'
      case 'ai_timeout':
        return 'Moni tardó demasiado en responder. Probá de nuevo con una pregunta más puntual.'
      case 'invalid_request':
        return 'No pude entender esa pregunta. Probá con una más corta.'
      case 'not_authenticated':
        return toUserMessage(error)
      default:
        return 'Moni no pudo responder ahora. Probá de nuevo en un ratito.'
    }
  }
  return toUserMessage(error)
}
