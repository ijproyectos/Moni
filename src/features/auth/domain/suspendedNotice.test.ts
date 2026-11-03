import {
  clearSuspendedNotice,
  isBannedCallback,
  markSuspendedNotice,
  readSuspendedNotice,
} from './suspendedNotice'

describe('isBannedCallback', () => {
  it('spots a banned account in the query string or in the hash', () => {
    expect(isBannedCallback('?error=access_denied&error_code=user_banned', '')).toBe(true)
    expect(
      isBannedCallback('', '#error=access_denied&error_code=user_banned&error_description=x'),
    ).toBe(true)
  })
  it('ignores other failures and a clean callback', () => {
    expect(isBannedCallback('?error=access_denied&error_code=bad_oauth_callback', '')).toBe(false)
    expect(isBannedCallback('?code=abc', '')).toBe(false)
    expect(isBannedCallback('', '')).toBe(false)
  })
})

describe('suspended notice', () => {
  afterEach(() => clearSuspendedNotice())
  it('is remembered for the welcome screen until cleared', () => {
    expect(readSuspendedNotice()).toBe(false)
    markSuspendedNotice()
    expect(readSuspendedNotice()).toBe(true)
    clearSuspendedNotice()
    expect(readSuspendedNotice()).toBe(false)
  })
})
