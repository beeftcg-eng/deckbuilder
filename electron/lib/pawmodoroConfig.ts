import { readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { pawmodoroConfigFile } from './paths'

/** The one "connect your Pawmodoro account" config, shared by pawmodoro.ts (wishlist push,
 * trading) and deckbuilderSync.ts (this app's own decks/collection/wishlist sync) - connecting
 * once turns both on, since they're the same account and the same underlying Supabase project. */
export interface StoredPawmodoroConfig {
  url: string
  anonKey: string
  email: string
  refreshToken: string
}

export async function readPawmodoroConfig(): Promise<StoredPawmodoroConfig | null> {
  const path = pawmodoroConfigFile()
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as StoredPawmodoroConfig
  } catch {
    return null
  }
}

export async function writePawmodoroConfig(config: StoredPawmodoroConfig): Promise<void> {
  await writeFile(pawmodoroConfigFile(), JSON.stringify(config, null, 2), 'utf-8')
}

export async function clearPawmodoroConfig(): Promise<void> {
  const path = pawmodoroConfigFile()
  if (existsSync(path)) await rm(path)
}
