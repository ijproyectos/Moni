import { useCallback, useState } from 'react'
import type { Story } from '../domain/stories'

const KEY = (userId: string) => `moni:stories-seen:v1:${userId}`

function read(userId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/**
 * Which stories were already opened, per person, in this device only (nothing about it reaches the database). A story
 * counts as seen for the exact news it had: when its signature changes it comes back as new.
 */
export function useStorySeen(userId: string) {
  const [seen, setSeen] = useState(() => read(userId))
  const isSeen = useCallback((story: Story) => seen[story.id] === story.signature, [seen])
  const markSeen = useCallback(
    (story: Story) => {
      setSeen((current) => {
        if (current[story.id] === story.signature) return current
        const next = { ...current, [story.id]: story.signature }
        try {
          window.localStorage.setItem(KEY(userId), JSON.stringify(next))
        } catch {
          // Private mode or full storage: it simply shows as new next time.
        }
        return next
      })
    },
    [userId],
  )
  return { isSeen, markSeen }
}
