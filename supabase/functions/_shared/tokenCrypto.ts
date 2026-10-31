// AES-256-GCM encryption of Mercado Pago tokens at rest (design D1-D3). Web-standard APIs only (no Deno imports),
// so Vitest runs the tests from Node.
//
// Format: `v<kid>.<b64url nonce 12 bytes>.<b64url ciphertext+tag>`. AAD = `<user_id>|<column>`, so a ciphertext
// copied to another row or column fails to decrypt. Keys come from the Edge secrets `MP_TOKEN_KEYS` (JSON
// kid -> base64 of 32 bytes) and `MP_TOKEN_KEY_CURRENT` (kid used for new encryptions). Rotation: add a kid,
// flip CURRENT; decrypt picks the key by the kid in the ciphertext.
// Errors carry a fixed code only: never plaintext, keys, ciphertext or AAD.

export class TokenCryptoError extends Error {
  readonly code: string
  constructor(code: string) {
    super(`token_crypto:${code}`)
    this.name = 'TokenCryptoError'
    this.code = code
  }
}

export interface Keyring {
  readonly current: string
  readonly keys: ReadonlyMap<string, Uint8Array>
}

export interface CryptoContext {
  userId: string
  column: string
}

const KID_PATTERN = /^[A-Za-z0-9_-]{1,16}$/
const NONCE_BYTES = 12

function toB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  let bin: string
  try {
    bin = atob(padded)
  } catch {
    throw new TokenCryptoError('malformed')
  }
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** Parses the secrets into a keyring. Throws TokenCryptoError('config') on anything unusable. */
export function parseKeyring(keysJson: string | undefined, currentKid: string | undefined): Keyring {
  if (!keysJson || !currentKid) throw new TokenCryptoError('config')
  let parsed: unknown
  try {
    parsed = JSON.parse(keysJson)
  } catch {
    throw new TokenCryptoError('config')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TokenCryptoError('config')
  }
  const keys = new Map<string, Uint8Array>()
  for (const [kid, value] of Object.entries(parsed)) {
    if (!KID_PATTERN.test(kid) || typeof value !== 'string') throw new TokenCryptoError('config')
    let raw: Uint8Array
    try {
      raw = fromB64(value)
    } catch {
      throw new TokenCryptoError('config')
    }
    if (raw.byteLength !== 32) throw new TokenCryptoError('config')
    keys.set(kid, raw)
  }
  if (!keys.has(currentKid)) throw new TokenCryptoError('config')
  return { current: currentKid, keys }
}

function aad(ctx: CryptoContext): Uint8Array {
  return new TextEncoder().encode(`${ctx.userId}|${ctx.column}`)
}

async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** The kid of a stored ciphertext, or null when it is not in our format. */
export function keyIdOf(ciphertext: string): string | null {
  const match = /^v([A-Za-z0-9_-]{1,16})\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.exec(ciphertext)
  return match?.[1] ?? null
}

export async function encryptToken(
  plaintext: string,
  ctx: CryptoContext,
  ring: Keyring,
): Promise<string> {
  const raw = ring.keys.get(ring.current)
  if (!raw) throw new TokenCryptoError('config')
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  try {
    const key = await importKey(raw)
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad(ctx) as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    )
    return `v${ring.current}.${toB64Url(nonce)}.${toB64Url(new Uint8Array(ct))}`
  } catch {
    throw new TokenCryptoError('encrypt_failed')
  }
}

export async function decryptToken(
  ciphertext: string,
  ctx: CryptoContext,
  ring: Keyring,
): Promise<string> {
  const kid = keyIdOf(ciphertext)
  if (kid === null) throw new TokenCryptoError('malformed')
  const raw = ring.keys.get(kid)
  if (!raw) throw new TokenCryptoError('unknown_key')
  const [, nonceText, ctText] = ciphertext.split('.')
  try {
    const nonce = fromB64(nonceText ?? '')
    if (nonce.byteLength !== NONCE_BYTES) throw new TokenCryptoError('malformed')
    const key = await importKey(raw)
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad(ctx) as BufferSource },
      key,
      fromB64(ctText ?? '') as BufferSource,
    )
    return new TextDecoder().decode(plain)
  } catch (error) {
    if (error instanceof TokenCryptoError) throw error
    throw new TokenCryptoError('decrypt_failed')
  }
}
