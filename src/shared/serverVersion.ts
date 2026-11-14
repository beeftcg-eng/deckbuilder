import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from './pawmodoroDefaults'

/**
 * Which of the Pawmodoro project's Brewhouse updates have been run (scripts/pawmodoro-migration-*.sql),
 * so a feature that needs one can say so plainly instead of failing with a database error. Each
 * migration from 2026-11-15 on sets deckbuilder_server_version() to its number; before that there's
 * no such function, which reads as 0.
 */
export const SERVER_UPDATES: { version: number; file: string; for: string }[] = [
  { version: 1, file: 'pawmodoro-migration-2026-11-13-usage.sql', for: 'anonymous usage counts' },
  { version: 2, file: 'pawmodoro-migration-2026-11-14-practice-online.sql', for: 'online practice games' },
  { version: 3, file: 'pawmodoro-migration-2026-11-15-online-v2.sql', for: 'private hands and quicker online games' },
]

/** What this version of the app needs the server to be at. */
export const NEEDED_SERVER_VERSION = SERVER_UPDATES.at(-1)!.version

let cached: Promise<number | null> | null = null

/** The server's version: 0 before the first numbered update, null when it can't be reached. Asked once per launch. */
export function serverVersion(): Promise<number | null> {
  cached ??= (async () => {
    try {
      const res = await fetch(`${DEFAULT_PAWMODORO_URL}/rest/v1/rpc/deckbuilder_server_version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: DEFAULT_PAWMODORO_ANON_KEY, Authorization: `Bearer ${DEFAULT_PAWMODORO_ANON_KEY}` },
        body: '{}',
      })
      if (res.status === 404) return 0
      if (!res.ok) return null
      const n = Number(await res.json())
      return Number.isFinite(n) ? n : 0
    } catch {
      return null
    }
  })()
  return cached
}

/** The updates still to run for a feature needing `version` (empty when the server is up to date or unknown). */
export function missingUpdates(current: number | null, version: number = NEEDED_SERVER_VERSION) {
  if (current == null) return []
  return SERVER_UPDATES.filter((u) => u.version > current && u.version <= version)
}

/** For tests: ask again. */
export function forgetServerVersion() {
  cached = null
}
