import {
  buildSendTextPayload,
  computeHmacSha256Hex,
  formatConfirmationReply,
  formatPesos,
  graphMessagesUrl,
  isUndoCommand,
  parseInboundMessages,
  parseVerifyRequest,
  pickFallbackCategoryId,
  resolveChallenge,
  timingSafeEqualStrings,
  verifyMetaSignature,
  type ConfirmedMovement,
} from './lib.ts'
import type { CategoryRef, ParsedMovement } from '../parse-movements/lib.ts'

describe('timingSafeEqualStrings', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStrings('abc', 'ab')).toBe(false)
  })
})

describe('verifyMetaSignature', () => {
  it('accepts a signature computed with the same secret and rejects everything else', async () => {
    const secret = 'app-secret'
    const body = '{"object":"whatsapp_business_account"}'
    const hex = await computeHmacSha256Hex(secret, body)
    expect(await verifyMetaSignature(secret, `sha256=${hex}`, body)).toBe(true)
    expect(await verifyMetaSignature(secret, `sha256=${hex}`, body + 'x')).toBe(false)
    expect(await verifyMetaSignature('other-secret', `sha256=${hex}`, body)).toBe(false)
    expect(await verifyMetaSignature(secret, null, body)).toBe(false)
    expect(await verifyMetaSignature(secret, hex, body)).toBe(false) // missing "sha256=" scheme
  })
})

describe('parseVerifyRequest / resolveChallenge', () => {
  const expectedToken = 'verify-me'

  it('echoes the challenge when mode and token match', () => {
    const url = new URL(
      `https://x.test/?hub.mode=subscribe&hub.verify_token=${expectedToken}&hub.challenge=123`,
    )
    expect(resolveChallenge(parseVerifyRequest(url), expectedToken)).toBe('123')
  })

  it('rejects a wrong token, a wrong mode, or a missing challenge', () => {
    const wrongToken = new URL(
      'https://x.test/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=123',
    )
    expect(resolveChallenge(parseVerifyRequest(wrongToken), expectedToken)).toBeNull()

    const wrongMode = new URL(
      `https://x.test/?hub.mode=unsubscribe&hub.verify_token=${expectedToken}&hub.challenge=123`,
    )
    expect(resolveChallenge(parseVerifyRequest(wrongMode), expectedToken)).toBeNull()

    const noChallenge = new URL(`https://x.test/?hub.mode=subscribe&hub.verify_token=${expectedToken}`)
    expect(resolveChallenge(parseVerifyRequest(noChallenge), expectedToken)).toBeNull()
  })
})

describe('parseInboundMessages', () => {
  function payload(messages: unknown[]) {
    return {
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-1', changes: [{ field: 'messages', value: { messages } }] }],
    }
  }

  it('extracts a text message', () => {
    const body = payload([
      { from: '5491100000000', id: 'wamid.1', timestamp: '1700000000', type: 'text', text: { body: 'hola' } },
    ])
    expect(parseInboundMessages(body)).toEqual([
      { waId: '5491100000000', wamid: 'wamid.1', timestamp: 1700000000, kind: 'text', body: 'hola' },
    ])
  })

  it('keeps a non-text message with a null body instead of dropping it', () => {
    const body = payload([
      { from: '5491100000000', id: 'wamid.2', timestamp: '1700000000', type: 'image' },
    ])
    expect(parseInboundMessages(body)).toEqual([
      { waId: '5491100000000', wamid: 'wamid.2', timestamp: 1700000000, kind: 'image', body: null },
    ])
  })

  it('returns an empty list for a status-only payload or garbage input', () => {
    const statusOnly = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'waba-1', changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.3' }] } }] }],
    }
    expect(parseInboundMessages(statusOnly)).toEqual([])
    expect(parseInboundMessages(null)).toEqual([])
    expect(parseInboundMessages({})).toEqual([])
    expect(parseInboundMessages({ entry: 'not-an-array' })).toEqual([])
  })

  it('drops a message missing required fields instead of throwing', () => {
    const body = payload([{ from: '5491100000000', type: 'text' }])
    expect(parseInboundMessages(body)).toEqual([])
  })
})

describe('isUndoCommand', () => {
  it('matches "deshacer"/"borrar" case- and whitespace-insensitively, nothing else', () => {
    expect(isUndoCommand('deshacer')).toBe(true)
    expect(isUndoCommand('  Deshacer  ')).toBe(true)
    expect(isUndoCommand('BORRAR')).toBe(true)
    expect(isUndoCommand('deshacer el gasto')).toBe(false)
    expect(isUndoCommand('')).toBe(false)
  })
})

describe('formatPesos', () => {
  it('formats whole and fractional pesos the Argentine way', () => {
    expect(formatPesos(1_234_50)).toBe('$1.234,50')
    expect(formatPesos(1_500_00)).toBe('$1.500')
    expect(formatPesos(50)).toBe('$0,50')
  })
})

describe('pickFallbackCategoryId', () => {
  const categories: CategoryRef[] = [
    { id: 'sueldo', name: 'Sueldo', kind: 'income' },
    { id: 'comida', name: 'Comida', kind: 'expense' },
    { id: 'otros-expense', name: 'Otros', kind: 'expense' },
    { id: 'otros-income', name: 'otros', kind: 'income' }, // case-insensitive match on purpose
  ]

  it('prefers "otros" among categories of the requested kind', () => {
    expect(pickFallbackCategoryId(categories, 'expense')).toBe('otros-expense')
    expect(pickFallbackCategoryId(categories, 'income')).toBe('otros-income')
  })

  it('falls back to the first (oldest) category of that kind when there is no "otros"', () => {
    const noOtros: CategoryRef[] = [
      { id: 'first', name: 'Super', kind: 'expense' },
      { id: 'second', name: 'Transporte', kind: 'expense' },
    ]
    expect(pickFallbackCategoryId(noOtros, 'expense')).toBe('first')
  })

  it('returns null when there is no category of that kind at all', () => {
    expect(pickFallbackCategoryId([], 'expense')).toBeNull()
    expect(pickFallbackCategoryId([{ id: 'x', name: 'Sueldo', kind: 'income' }], 'expense')).toBeNull()
  })
})

describe('formatConfirmationReply', () => {
  function movement(overrides: Partial<ParsedMovement> = {}): ParsedMovement {
    return {
      kind: 'expense',
      amountCents: 1_500_00,
      note: null,
      categoryId: 'comida',
      accountId: 'cuenta-1',
      occurredOn: '2026-11-21',
      confidence: 0.9,
      ...overrides,
    }
  }

  it('confirms a single expense with its category and an undo hint', () => {
    const items: ConfirmedMovement[] = [{ movement: movement(), categoryName: 'Comida' }]
    expect(formatConfirmationReply(items)).toBe(
      'Cargué $1.500 en Comida 🐱.\nSi me equivoqué, respondé "deshacer".',
    )
  })

  it('includes the note and handles income wording', () => {
    const items: ConfirmedMovement[] = [
      { movement: movement({ note: 'nafta' }), categoryName: 'Auto' },
      { movement: movement({ kind: 'income', amountCents: 50_000_00, note: null }), categoryName: 'Sueldo' },
    ]
    const text = formatConfirmationReply(items)
    expect(text).toContain('Cargué $1.500 en Auto (nafta) 🐱.')
    expect(text).toContain('Cargué un ingreso de $50.000 🐱.')
  })
})

describe('graphMessagesUrl / buildSendTextPayload', () => {
  it('builds the Graph API URL and a text message payload', () => {
    expect(graphMessagesUrl('123456')).toBe('https://graph.facebook.com/v25.0/123456/messages')
    expect(buildSendTextPayload('5491100000000', 'hola')).toEqual({
      messaging_product: 'whatsapp',
      to: '5491100000000',
      type: 'text',
      text: { body: 'hola' },
    })
  })
})
