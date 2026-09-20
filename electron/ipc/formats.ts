import { ipcMain } from 'electron'
import { stat } from 'node:fs/promises'
import type { Format, GameId } from '../../src/shared/types'
import { GAME_LIST } from '../../src/shared/games/registry'
import { formatsFile } from '../lib/paths'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from '../lib/jsonStore'

type FormatsFile = Record<GameId, Format[]>

function defaultFormatsFile(): FormatsFile {
  const result = {} as FormatsFile
  for (const adapter of GAME_LIST) result[adapter.id] = adapter.defaultFormats
  return result
}

async function readFormatsFile(): Promise<FormatsFile> {
  const defaults = defaultFormatsFile()
  const existing = await readJsonFile<Partial<FormatsFile> | null>(formatsFile(), null, isPlainObject)
  if (!existing) {
    await writeJsonAtomic(formatsFile(), defaults)
    return defaults
  }
  // Fill in any game missing from a user-edited file (e.g. after adding a new game).
  for (const gameId of Object.keys(defaults) as GameId[]) {
    if (!Array.isArray(existing[gameId])) existing[gameId] = defaults[gameId]
  }
  return existing as FormatsFile
}

// Files written before the in-app ban-list editor have no reviewedAt, so the
// file's modified time (when it was created or last hand-edited) stands in.
async function withReviewedAt(formats: Format[]): Promise<Format[]> {
  const fallback = (await stat(formatsFile())).mtime.toISOString()
  return formats.map((f) => ({ ...f, reviewedAt: f.reviewedAt ?? fallback }))
}

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string')

function sanitizeFormat(raw: Format, reviewedAt: string): Format {
  if (typeof raw?.id !== 'string' || typeof raw.label !== 'string') throw new Error('Invalid format: missing id or label')
  const pairs = Array.isArray(raw.bannedPairs)
    ? raw.bannedPairs.filter((p): p is [string, string] => isStringArray(p) && p.length === 2)
    : []
  return {
    id: raw.id,
    label: raw.label,
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(isStringArray(raw.legalSetIds) ? { legalSetIds: raw.legalSetIds } : {}),
    bannedCardIds: isStringArray(raw.bannedCardIds) ? raw.bannedCardIds : [],
    restrictedCardIds: isStringArray(raw.restrictedCardIds) ? raw.restrictedCardIds : [],
    bannedPairs: pairs,
    reviewedAt,
  }
}

export function registerFormatsIpc(): void {
  ipcMain.handle('formats:list', (_e, gameId: GameId): Promise<Format[]> =>
    withLock('formats', async () => {
      const all = await readFormatsFile()
      return withReviewedAt(all[gameId] ?? [])
    }),
  )

  ipcMain.handle('formats:path', (): Promise<string> =>
    withLock('formats', async () => {
      await readFormatsFile()
      return formatsFile()
    }),
  )

  // Saves one game's formats from the in-app ban-list editor and stamps them
  // as reviewed now (saving with no changes is how "mark as reviewed" works).
  ipcMain.handle('formats:save', (_e, gameId: GameId, formats: Format[]): Promise<Format[]> =>
    withLock('formats', async () => {
      if (!Array.isArray(formats) || formats.length === 0) throw new Error('Nothing to save')
      const reviewedAt = new Date().toISOString()
      const all = await readFormatsFile()
      // Rewriting the file resets its modified time, which stands in for "reviewed" on games
      // that have no date yet — pin those to the old time first, or saving one game's list
      // would make every other game's untouched list look freshly reviewed.
      const previousModified = (await stat(formatsFile())).mtime.toISOString()
      for (const other of Object.keys(all) as GameId[]) {
        if (other !== gameId) all[other] = all[other].map((f) => ({ ...f, reviewedAt: f.reviewedAt ?? previousModified }))
      }
      all[gameId] = formats.map((f) => sanitizeFormat(f, reviewedAt))
      await writeJsonAtomic(formatsFile(), all)
      return all[gameId]
    }),
  )
}
