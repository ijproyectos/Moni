import { describe, expect, it } from 'vitest'
import {
  decryptToken,
  encryptToken,
  keyIdOf,
  parseKeyring,
  TokenCryptoError,
  type Keyring,
} from './tokenCrypto.ts'

const b64 = (fill: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(fill)))
const ctx = { userId: '11111111-1111-1111-1111-111111111111', column: 'access_token_enc' }
const ring: Keyring = parseKeyring(JSON.stringify({ '1': b64(1), '2': b64(2) }), '1')

describe('parseKeyring', () => {
  it('requires the current kid to exist and keys to be 32 bytes', () => {
    expect(() => parseKeyring(JSON.stringify({ '1': b64(1) }), '2')).toThrow(TokenCryptoError)
    expect(() => parseKeyring(JSON.stringify({ '1': btoa('short') }), '1')).toThrow(TokenCryptoError)
    expect(() => parseKeyring('not json', '1')).toThrow(TokenCryptoError)
    expect(() => parseKeyring(undefined, '1')).toThrow(TokenCryptoError)
    expect(() => parseKeyring(JSON.stringify({ 'a.b': b64(1) }), 'a.b')).toThrow(TokenCryptoError)
  })
})

describe('encryptToken / decryptToken', () => {
  it('round-trips and uses the v<kid>.<nonce>.<ct> format without plaintext', async () => {
    const enc = await encryptToken('APP_USR-secret-token', ctx, ring)
    expect(enc).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/)
    expect(enc).not.toContain('APP_USR')
    expect(keyIdOf(enc)).toBe('1')
    expect(await decryptToken(enc, ctx, ring)).toBe('APP_USR-secret-token')
  })

  it('uses a fresh nonce on every encryption', async () => {
    const a = await encryptToken('same', ctx, ring)
    const b = await encryptToken('same', ctx, ring)
    expect(a).not.toBe(b)
  })

  it('binds the user and the column through AAD', async () => {
    const enc = await encryptToken('t', ctx, ring)
    await expect(decryptToken(enc, { ...ctx, userId: 'other' }, ring)).rejects.toThrow(TokenCryptoError)
    await expect(decryptToken(enc, { ...ctx, column: 'refresh_token_enc' }, ring)).rejects.toThrow(
      TokenCryptoError,
    )
  })

  it('rejects tampered or malformed ciphertext', async () => {
    const enc = await encryptToken('t', ctx, ring)
    const tampered = enc.slice(0, -2) + (enc.endsWith('AA') ? 'BB' : 'AA')
    await expect(decryptToken(tampered, ctx, ring)).rejects.toThrow(TokenCryptoError)
    await expect(decryptToken('garbage', ctx, ring)).rejects.toThrow(TokenCryptoError)
    await expect(decryptToken('v9.aaaaaaaaaaaaaaaa.xx', ctx, ring)).rejects.toThrow(TokenCryptoError)
  })

  it('rotates by kid: old ciphertext still decrypts, new ones use the current kid', async () => {
    const enc1 = await encryptToken('t', ctx, ring)
    const rotated = parseKeyring(JSON.stringify({ '1': b64(1), '2': b64(2) }), '2')
    expect(await decryptToken(enc1, ctx, rotated)).toBe('t')
    const enc2 = await encryptToken('t', ctx, rotated)
    expect(keyIdOf(enc2)).toBe('2')
    const withoutOld = parseKeyring(JSON.stringify({ '2': b64(2) }), '2')
    await expect(decryptToken(enc1, ctx, withoutOld)).rejects.toThrow(TokenCryptoError)
  })

  it('never leaks plaintext or keys in error messages', async () => {
    const enc = await encryptToken('TOP-SECRET', ctx, ring)
    try {
      await decryptToken(enc, { ...ctx, userId: 'x' }, ring)
    } catch (e) {
      expect(String(e)).not.toContain('TOP-SECRET')
      expect(String(e)).not.toContain(b64(1))
    }
  })
})
