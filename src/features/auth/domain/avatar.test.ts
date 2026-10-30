import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { googleAvatarUrl, resolveAvatarUrl } from './avatar'

const user = (over: Partial<User>) =>
  ({ id: 'u', user_metadata: {}, identities: [], ...over }) as User

describe('googleAvatarUrl', () => {
  it('prefers user_metadata.avatar_url, then picture, then the identity data', () => {
    expect(
      googleAvatarUrl(
        user({
          user_metadata: {
            avatar_url: 'https://lh3.googleusercontent.com/a',
            picture: 'https://x/p',
          },
        }),
      ),
    ).toBe('https://lh3.googleusercontent.com/a')
    expect(googleAvatarUrl(user({ user_metadata: { picture: 'https://x/p' } }))).toBe('https://x/p')
    expect(
      googleAvatarUrl(
        user({
          identities: [
            { identity_data: { avatar_url: 'https://x/i' } },
          ] as unknown as User['identities'],
        }),
      ),
    ).toBe('https://x/i')
  })

  it('ignores missing, non-string and non-https values', () => {
    expect(googleAvatarUrl(null)).toBeNull()
    expect(googleAvatarUrl(user({}))).toBeNull()
    expect(
      googleAvatarUrl(user({ user_metadata: { avatar_url: 42, picture: 'javascript:x' } })),
    ).toBeNull()
  })
})

describe('resolveAvatarUrl', () => {
  const google = user({ user_metadata: { picture: 'https://g/p' } })
  it('lets a photo picked on the device win, otherwise Google, otherwise the profile row', () => {
    expect(resolveAvatarUrl({ uploadedUrl: 'blob:1', user: google, profileUrl: 'https://p' })).toBe(
      'blob:1',
    )
    expect(resolveAvatarUrl({ user: google, profileUrl: 'https://p' })).toBe('https://g/p')
    expect(resolveAvatarUrl({ user: user({}), profileUrl: 'https://p' })).toBe('https://p')
    expect(resolveAvatarUrl({ user: user({}), profileUrl: null })).toBeNull()
  })
})
