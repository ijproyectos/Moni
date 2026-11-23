import { isColdStart, resetSplashDecision, shouldPlaySplash, SPLASH_SESSION_KEY, type LaunchEnv } from './coldStart'

const base: LaunchEnv = { navigationType: 'navigate', pathname: '/', reducedMotion: false, alreadyPlayed: false }

describe('isColdStart', () => {
  it('is a cold start for a fresh launch', () => {
    expect(isColdStart(base)).toBe(true)
  })
  it('is not when this session already launched (minimize, lock, tab switch)', () => {
    expect(isColdStart({ ...base, alreadyPlayed: true })).toBe(false)
  })
  it('is not for a reload or a back/forward restore', () => {
    expect(isColdStart({ ...base, navigationType: 'reload' })).toBe(false)
    expect(isColdStart({ ...base, navigationType: 'back_forward' })).toBe(false)
  })
  it('respects reduced motion', () => {
    expect(isColdStart({ ...base, reducedMotion: true })).toBe(false)
  })
  it('never covers the OAuth callback', () => {
    expect(isColdStart({ ...base, pathname: '/auth/callback' })).toBe(false)
  })
})

describe('shouldPlaySplash', () => {
  beforeEach(() => {
    resetSplashDecision()
    window.sessionStorage.clear()
  })
  it('plays once per session, decides once per page load, and never uses a permanent mark', () => {
    expect(shouldPlaySplash()).toBe(true)
    expect(shouldPlaySplash()).toBe(true)
    expect(window.sessionStorage.getItem(SPLASH_SESSION_KEY)).toBe('1')
    expect(window.localStorage.getItem(SPLASH_SESSION_KEY)).toBeNull()
    // A new page load in the same session (reload / tab restored) does not play it again.
    resetSplashDecision()
    expect(shouldPlaySplash()).toBe(false)
  })
})
