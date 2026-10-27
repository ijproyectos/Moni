import { afterEach, describe, expect, it } from 'vitest'
import { clearReturnTo, isSafeReturnPath, peekReturnTo, rememberReturnTo } from './returnTo'

afterEach(() => clearReturnTo())

describe('returnTo', () => {
  it('keeps an invite link across the auth redirect', () => {
    rememberReturnTo('/unirse/ABCD2345')
    expect(peekReturnTo()).toBe('/unirse/ABCD2345')
    clearReturnTo()
    expect(peekReturnTo()).toBeNull()
  })

  it('ignores Inicio and unsafe or auth paths', () => {
    rememberReturnTo('/')
    expect(peekReturnTo()).toBeNull()
    expect(isSafeReturnPath('//evil.example')).toBe(false)
    expect(isSafeReturnPath('https://evil.example')).toBe(false)
    expect(isSafeReturnPath('/bienvenida')).toBe(false)
    expect(isSafeReturnPath('/auth/callback')).toBe(false)
    expect(isSafeReturnPath('/grupos/abc')).toBe(true)
  })
})
