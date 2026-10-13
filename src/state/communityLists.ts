import { useEffect, useState } from 'react'
import { fromRiftAtlas, type CommunityList } from '../shared/communityLists'

/**
 * RiftAtlas's lists (shared/communityLists.ts), read once and kept for a while: the Community lists
 * window and the deck editor's "start from a list" both use them, and the page only changes when an
 * event is added.
 */
const CACHE_MS = 30 * 60 * 1000
let cache: { at: number; lists: CommunityList[] } | null = null
let inFlight: Promise<CommunityList[]> | null = null

export function cachedCommunityLists(): CommunityList[] | null {
  return cache && Date.now() - cache.at < CACHE_MS ? cache.lists : null
}

export function loadCommunityLists(): Promise<CommunityList[]> {
  const cached = cachedCommunityLists()
  if (cached) return Promise.resolve(cached)
  inFlight ??= window.api
    .fetchCommunityLists()
    .then((html) => {
      const lists = fromRiftAtlas(html)
      cache = { at: Date.now(), lists }
      return lists
    })
    .catch((err: unknown) => {
      // In the bug report's error log, so a RiftAtlas change shows up there too.
      console.error('Community lists:', err)
      throw err
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** The lists, loading them when `enabled`; `retry` tries again after an error. */
export function useCommunityLists(enabled = true): { lists: CommunityList[] | null; error: string | null; retry: () => void } {
  const [lists, setLists] = useState<CommunityList[] | null>(cachedCommunityLists)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled || lists) return
    let cancelled = false
    loadCommunityLists()
      .then((read) => !cancelled && setLists(read))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [enabled, lists, attempt])
  return {
    lists,
    error,
    retry: () => {
      setError(null)
      setAttempt((n) => n + 1)
    },
  }
}
