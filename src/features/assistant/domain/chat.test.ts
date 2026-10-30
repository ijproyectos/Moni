import { AiError } from '@/features/ai/api/aiRepository'
import { OfflineError, OFFLINE_MESSAGE } from '@/shared/lib/offline'
import {
  assistantErrorMessage,
  isSendable,
  SUGGESTIONS,
  toRequestMessages,
  type ChatMessage,
} from './chat'

const msg = (i: number, role: 'user' | 'assistant', content = `m${i}`): ChatMessage => ({
  id: `m${i}`,
  role,
  content,
})

describe('toRequestMessages', () => {
  it('keeps the last 12 messages and starts with a user message', () => {
    const history = Array.from({ length: 15 }, (_, i) => msg(i, i % 2 === 0 ? 'user' : 'assistant'))
    const out = toRequestMessages(history)
    expect(out.length).toBeLessThanOrEqual(12)
    expect(out[0]?.role).toBe('user')
    expect(out.at(-1)?.content).toBe('m14')
  })
  it('cuts long replies to 1000 chars and strips ids', () => {
    const out = toRequestMessages([msg(0, 'user'), msg(1, 'assistant', 'a'.repeat(1500)), msg(2, 'user')])
    expect(Array.from(out[1]?.content ?? '').length).toBe(1000)
    expect(Object.keys(out[0] ?? {})).toEqual(['role', 'content'])
  })
  it('returns nothing without a user message', () => {
    expect(toRequestMessages([msg(0, 'assistant')])).toEqual([])
  })
})

describe('isSendable', () => {
  it('rejects blanks and over-long text', () => {
    expect(isSendable('   ')).toBe(false)
    expect(isSendable('hola')).toBe(true)
    expect(isSendable('a'.repeat(1001))).toBe(false)
  })
})

describe('assistantErrorMessage', () => {
  it('maps the known codes to Spanish copy', () => {
    expect(assistantErrorMessage(new AiError('ai_quota_exceeded'))).toMatch(/límite de preguntas/)
    expect(assistantErrorMessage(new AiError('ai_timeout'))).toMatch(/tardó/)
    expect(assistantErrorMessage(new AiError('ai_unavailable'))).toMatch(/no pudo responder/)
    expect(assistantErrorMessage(new AiError('whatever'))).toMatch(/no pudo responder/)
    expect(assistantErrorMessage(new OfflineError())).toBe(OFFLINE_MESSAGE)
  })
  it('has the five suggested questions', () => {
    expect(SUGGESTIONS).toHaveLength(5)
  })
})
