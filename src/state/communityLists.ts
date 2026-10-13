import { useEffect, useSyncExternalStore } from 'react'
import { COMMUNITY_FILE_URL, collectCommunityLists, readCommunityListsFile, type CommunityList, type CommunityListsFile } from '../shared/communityLists'

/**
 * RiftAtlas's lists for the Community lists window and the deck editor's "start from a list"
 * (shared/communityLists.ts). Read from the file the daily deploy publishes next to the phone app;
 * the desktop app reads RiftAtlas itself when that file is missing or more than a day and a half
 * old. The last good copy is kept on the device, shown straight away and used when offline.
 */

const STORAGE_KEY = 'brewhouse.communityLists.v1'
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

function savedCopy(): CommunityListsFile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? readCommunityListsFile(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function saveCopy(file: CommunityListsFile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
  } catch {
    // storage full or blocked: the lists just aren't kept for offline
  }
}

let state: CommunityListsState = { file: null, offline: false, error: null, loading: false }
let initialized = false
let lastRead = 0
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function setState(patch: Partial<CommunityListsState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

async function publishedFile(): Promise<CommunityListsFile | null> {
  try {
    const res = await fetch(COMMUNITY_FILE_URL, { cache: 'no-store' })
    return res.ok ? readCommunityListsFile(await res.json()) : null
  } catch {
    return null
  }
}

async function read(): Promise<CommunityListsFile> {
  const published = await publishedFile()
  if (published && Date.now() - new Date(published.updatedAt).getTime() < STALE_MS) return published
  if (!__WEB__) {
    try {
      return await collectCommunityLists((url) => window.api.fetchCommunityPage(url))
    } catch (err) {
      if (!published) throw err
    }
  }
  if (published) return published
  throw new Error('No community lists file')
}

/** Reads the lists again (once at a time), unless they were read in the last half hour or `force`. */
export function refreshCommunityLists(force = false): Promise<void> {
  if (!initialized) {
    initialized = true
    const saved = savedCopy()
    if (saved) setState({ file: saved })
  }
  if (inFlight) return inFlight
  if (!force && state.file && !state.offline && Date.now() - lastRead < RECHECK_MS) return Promise.resolve()
  setState({ loading: true, error: null })
  inFlight = read()
    .then((file) => {
      lastRead = Date.now()
      saveCopy(file)
      setState({ file, offline: false, loading: false })
    })
    .catch((err: unknown) => {
      // In the bug report's error log, so a RiftAtlas change shows up there too.
      console.error('Community lists:', err)
      const message = err instanceof Error ? err.message : String(err)
      setState(state.file ? { offline: true, loading: false } : { error: message, loading: false })
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The lists, read when `enabled`. */
export function useCommunityLists(enabled = true): CommunityListsState & { lists: CommunityList[] | null; retry: () => void } {
  const current = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    if (enabled) void refreshCommunityLists()
  }, [enabled])
  return { ...current, lists: current.file?.lists ?? null, retry: () => void refreshCommunityLists(true) }
}

/** The lists read so far (or kept on the device), for code outside React. */
export function communityListsNow(): CommunityList[] | null {
  return state.file?.lists ?? null
}

/** For tests: forget everything read so far. */
export function resetCommunityLists() {
  state = { file: null, offline: false, error: null, loading: false }
  initialized = false
  lastRead = 0
  inFlight = null
}
