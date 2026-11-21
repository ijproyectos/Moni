import {
  computeHmacSha256Hex,
  parseInboundMessages,
  parseVerifyRequest,
  resolveChallenge,
  timingSafeEqualStrings,
  verifyMetaSignature,
} from './lib.ts'

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
