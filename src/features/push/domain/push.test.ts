import {
  detectPushSupport,
  isIos,
  subscriptionToRpcArgs,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from './push'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'

const base: PushEnvironment = {
  userAgent: CHROME,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
}

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url with and without padding', () => {
    expect([...urlBase64ToUint8Array('SGk')]).toEqual([72, 105])
    expect([...urlBase64ToUint8Array('SGk=')]).toEqual([72, 105])
  })
  it('maps the url-safe alphabet', () => {
    // 0xfb 0xff 0xbf encodes to "+/+/" in base64 and "-_-_" in base64url.
    expect([...urlBase64ToUint8Array('-_-_')]).toEqual([0xfb, 0xff, 0xbf])
  })
})

describe('isIos', () => {
  it('detects iPhone and iPadOS desktop-mode user agents', () => {
    expect(isIos(IPHONE)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIos(CHROME)).toBe(false)
  })
})

describe('detectPushSupport', () => {
  it('is available on a capable browser', () => {
    expect(detectPushSupport(base)).toBe('available')
  })
  it('asks iPhone users to install the app first', () => {
    expect(detectPushSupport({ ...base, userAgent: IPHONE, hasPushManager: false })).toBe(
      'needs_install',
    )
  })
  it('lets an installed iPhone PWA through', () => {
    expect(detectPushSupport({ ...base, userAgent: IPHONE, standalone: true })).toBe('available')
  })
  it('is unsupported without service worker, PushManager or Notification', () => {
    expect(detectPushSupport({ ...base, hasServiceWorker: false })).toBe('unsupported')
    expect(detectPushSupport({ ...base, hasPushManager: false })).toBe('unsupported')
    expect(detectPushSupport({ ...base, hasNotification: false, permission: null })).toBe(
      'unsupported',
    )
  })
  it('reports a blocked permission', () => {
    expect(detectPushSupport({ ...base, permission: 'denied' })).toBe('denied')
  })
})

describe('subscriptionToRpcArgs', () => {
  it('maps endpoint, keys and a capped user agent', () => {
    const args = subscriptionToRpcArgs(
      { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } },
      'x'.repeat(600),
    )
    expect(args).toEqual({
      p_endpoint: 'https://push.example/1',
      p_p256dh: 'p',
      p_auth: 'a',
      p_user_agent: 'x'.repeat(512),
    })
  })
  it('returns null when something is missing', () => {
    expect(subscriptionToRpcArgs({ endpoint: 'https://x' }, 'ua')).toBeNull()
    expect(subscriptionToRpcArgs({ keys: { p256dh: 'p', auth: 'a' } }, 'ua')).toBeNull()
  })
})
