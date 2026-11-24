import {
  buildTwilioSendForm,
  buildTwilioSignatureBase,
  computeTwilioSignature,
  normalizeWhatsAppNumber,
  paramsToRecord,
  parseTwilioMessage,
  timingSafeEqualStrings,
  twilioMessagesUrl,
  verifyTwilioSignature,
} from './lib.ts'

describe('timingSafeEqualStrings', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStrings('abc', 'ab')).toBe(false)
  })
})

describe('buildTwilioSignatureBase', () => {
  it('appends every param key+value, sorted alphabetically by key, after the url', () => {
    const base = buildTwilioSignatureBase('https://x.test/webhook', { To: 'whatsapp:+1', From: 'whatsapp:+2' })
    expect(base).toBe('https://x.test/webhookFromwhatsapp:+2Towhatsapp:+1')
  })
})

describe('computeTwilioSignature / verifyTwilioSignature', () => {
  // Params/url shape from Twilio's webhook security docs (https://www.twilio.com/docs/usage/webhooks/webhooks-security);
  // the expected signature itself is independently computed here (HMAC-SHA1 + base64, verified against Python's
  // hmac/hashlib), not copy-pasted from the docs, so this is a correctness check on our own implementation.
  const authToken = '12345'
  const url = 'https://mycompany.com/myapp.php?foo=1&bar=2'
  const params = { CallSid: 'CA1234567890ABCDE', Caller: '+14158675310', Digits: '1234', From: '+14158675310', To: '+18005551212' }
  const expectedSignature = 'GvWf1cFY/Q7PnoempGyD5oXAezc='

  it('computes the expected HMAC-SHA1 signature for a known input', async () => {
    expect(await computeTwilioSignature(authToken, buildTwilioSignatureBase(url, params))).toBe(expectedSignature)
  })

  it('accepts the matching signature and rejects a tampered one or wrong secret', async () => {
    expect(await verifyTwilioSignature(authToken, url, params, expectedSignature)).toBe(true)
    expect(await verifyTwilioSignature(authToken, url, { ...params, Digits: '0000' }, expectedSignature)).toBe(
      false,
    )
    expect(await verifyTwilioSignature('wrong-token', url, params, expectedSignature)).toBe(false)
    expect(await verifyTwilioSignature(authToken, url, params, null)).toBe(false)
  })
})

describe('paramsToRecord / parseTwilioMessage', () => {
  it('reads From/Body/MessageSid out of a urlencoded form', () => {
    const params = paramsToRecord(
      new URLSearchParams('From=whatsapp%3A%2B5491138807642&Body=gaste+500+en+nafta&MessageSid=SM123'),
    )
    expect(parseTwilioMessage(params)).toEqual({
      from: 'whatsapp:+5491138807642',
      messageSid: 'SM123',
      body: 'gaste 500 en nafta',
    })
  })

  it('treats an empty Body as no text, and returns null without From/MessageSid', () => {
    const withEmptyBody = paramsToRecord(new URLSearchParams('From=whatsapp%3A%2B5491138807642&Body=&MessageSid=SM1'))
    expect(parseTwilioMessage(withEmptyBody)?.body).toBeNull()
    expect(parseTwilioMessage({ Body: 'hola' })).toBeNull()
  })
})

describe('normalizeWhatsAppNumber', () => {
  it('strips the "whatsapp:" prefix and the leading "+"', () => {
    expect(normalizeWhatsAppNumber('whatsapp:+5491138807642')).toBe('5491138807642')
    expect(normalizeWhatsAppNumber('+5491138807642')).toBe('5491138807642')
  })
})

describe('twilioMessagesUrl / buildTwilioSendForm', () => {
  it('builds the REST API url and the outgoing message form', () => {
    expect(twilioMessagesUrl('AC123')).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    expect(buildTwilioSendForm('+14155238886', '5491138807642', 'hola').toString()).toBe(
      new URLSearchParams({
        From: 'whatsapp:+14155238886',
        To: 'whatsapp:+5491138807642',
        Body: 'hola',
      }).toString(),
    )
  })
})
