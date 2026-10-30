import type { User } from '@supabase/supabase-js'

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  return /^https:\/\//i.test(url) ? url : null
}

/** The Google account photo of a signed-in user: user_metadata avatar_url / picture, then the identity data. */
export function googleAvatarUrl(user: User | null | undefined): string | null {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  const identity = user.identities?.[0]?.identity_data ?? {}
  return (
    httpsUrl(meta.avatar_url) ??
    httpsUrl(meta.picture) ??
    httpsUrl(identity.avatar_url) ??
    httpsUrl(identity.picture)
  )
}

/**
 * Photo to show: one the person explicitly picked on this device wins, then the Google photo, then whatever
 * the profile row stored. Null means "show the initial".
 */
export function resolveAvatarUrl({
  uploadedUrl,
  user,
  profileUrl,
}: {
  uploadedUrl?: string | null
  user: User | null | undefined
  profileUrl?: string | null
}): string | null {
  return uploadedUrl || googleAvatarUrl(user) || httpsUrl(profileUrl) || null
}
