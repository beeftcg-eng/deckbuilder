import { useEffect, useSyncExternalStore } from 'react'
import { collectCommunityLists, readCommunityListsFile, type CommunityList, type CommunityListsFile } from '../shared/communityLists'
import { communityGame, type CommunityGameId } from '../shared/communityGames'

/**
 * Each game's Community lists (shared/communityGames.ts): Riftbound's from RiftAtlas, One Piece's and
 * Pokémon's from Limitless. Read from the file the daily deploy publishes next to the phone app; for
 * Riftbound the desktop app reads RiftAtlas itself when that file is missing or more than a day and a
 * half old. The last good copy is kept on the device, shown straight away and used when offline.
 */

const storageKey = (gameId: CommunityGameId) => (gameId === 'riftbound' ? 'brewhouse.communityLists.v1' : `brewhouse.communityLists.${gameId}.v1`)
/** How long a read lasts before the window looks again. */
const RECHECK_MS = 30 * 60 * 1000
/** A published file older than this is out of date (the deploy runs daily). */
const STALE_MS = 36 * 60 * 60 * 1000

export interface CommunityListsState {
  file: CommunityListsFile | null
  /** Showing the copy kept on this device because the lists couldn't be read just now. */
  offline: boolean
  error: string | null
  loading: boolean
}

interface GameState {
  state: CommunityListsState
  initialized: boolean
  lastRead: number
  inFlight: Promise<void> | null
}

const EMPTY: CommunityListsState = { file: null, offline: false, error: null, loading: false }
const games = new Map<CommunityGameId, GameState>()
const listeners = new Set<() => void>()

function gameState(gameId: CommunityGameId): GameState {
  let g = games.get(gameId)
  if (!g) games.set(gameId, (g = { state: EMPTY, initialized: false, lastRead: 0, inFlight: null }))
  return g
}

function savedCopy(gameId: CommunityGameId): CommunityListsFile | null {
  try {
    const raw = localStorage.getItem(storageKey(gameId))
    return raw ? readCommunityListsFile(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function saveCopy(gameId: CommunityGameId, file: CommunityListsFile) {
  try {
    localStorage.setItem(storageKey(gameId), JSON.stringify(file))
  } catch {
    // storage full or blocked: the lists just aren't kept for offline
  }
}

function setState(gameId: CommunityGameId, patch: Partial<CommunityListsState>) {
  const g = gameState(gameId)
  g.state = { ...g.state, ...patch }
  for (const l of listeners) l()
}

async function publishedFile(gameId: CommunityGameId): Promise<CommunityListsFile | null> {
  try {
    const res = await fetch(communityGame(gameId).fileUrl, { cache: 'no-store' })
    return res.ok ? readCommunityListsFile(await res.json()) : null
  } catch {
    return null
  }
}

async function read(gameId: CommunityGameId): Promise<CommunityListsFile> {
  const published = await publishedFile(gameId)
  if (published && Date.now() - new Date(published.updatedAt).getTime() < STALE_MS) return published
  if (!__WEB__ && gameId === 'riftbound') {
    try {
      return await collectCommunityLists((url) => window.api.fetchCommunityPage(url))
    } catch (err) {
      if (!published) throw err
    }
  }
  if (published) return published
  throw new Error('No community lists file')
}

/** Reads a game's lists again (once at a time), unless they were read in the last half hour or `force`. */
export function refreshCommunityLists(gameId: CommunityGameId = 'riftbound', force = false): Promise<void> {
  const g = gameState(gameId)
  if (!g.initialized) {
    g.initialized = true
    const saved = savedCopy(gameId)
    if (saved) setState(gameId, { file: saved })
  }
  if (g.inFlight) return g.inFlight
  if (!force && g.state.file && !g.state.offline && Date.now() - g.lastRead < RECHECK_MS) return Promise.resolve()
  setState(gameId, { loading: true, error: null })
  g.inFlight = read(gameId)
    .then((file) => {
      g.lastRead = Date.now()
      saveCopy(gameId, file)
      setState(gameId, { file, offline: false, loading: false })
    })
    .catch((err: unknown) => {
      // In the bug report's error log, so a source changing shows up there too.
      console.error(`Community lists (${gameId}):`, err)
      const message = err instanceof Error ? err.message : String(err)
      setState(gameId, g.state.file ? { offline: true, loading: false } : { error: message, loading: false })
    })
    .finally(() => {
      g.inFlight = null
    })
  return g.inFlight
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A game's lists, read when `enabled`. */
export function useCommunityLists(gameId: CommunityGameId, enabled = true): CommunityListsState & { lists: CommunityList[] | null; retry: () => void } {
  const current = useSyncExternalStore(subscribe, () => gameState(gameId).state)
  useEffect(() => {
    if (enabled) void refreshCommunityLists(gameId)
  }, [enabled, gameId])
  return { ...current, lists: current.file?.lists ?? null, retry: () => void refreshCommunityLists(gameId, true) }
}

/** A game's lists read so far (or kept on the device), for code outside React. */
export function communityListsNow(gameId: CommunityGameId = 'riftbound'): CommunityList[] | null {
  return gameState(gameId).state.file?.lists ?? null
}

/** For tests: forget everything read so far. */
export function resetCommunityLists() {
  games.clear()
}
