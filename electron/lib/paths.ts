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

export async function ensureDataDirs(): Promise<void> {
  await mkdir(cardsCacheDir(), { recursive: true })
}
