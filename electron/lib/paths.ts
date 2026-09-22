import { app } from 'electron'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

export function userDataDir(): string {
  return app.getPath('userData')
}

export function cardsCacheDir(): string {
  return join(userDataDir(), 'cards')
}

export function decksFile(): string {
  return join(userDataDir(), 'decks.json')
}

export function formatsFile(): string {
  return join(userDataDir(), 'formats.json')
}

export function wishlistFile(): string {
  return join(userDataDir(), 'wishlist.json')
}

export function collectionFile(): string {
  return join(userDataDir(), 'collection.json')
}

/** Card ids from `collection` currently marked "for trade" — a plain array, not merged into collection.json, so the existing quantity-only format never has to change. */
export function forTradeFile(): string {
  return join(userDataDir(), 'for-trade.json')
}

export function settingsFile(): string {
  return join(userDataDir(), 'settings.json')
}

export function backupsDir(): string {
  return join(userDataDir(), 'backups')
}

export function pawmodoroConfigFile(): string {
  return join(userDataDir(), 'pawmodoro-sync.json')
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(cardsCacheDir(), { recursive: true })
}
