import { ipcMain } from 'electron'
import type { AppSettings, GameId } from '../../src/shared/types'
import { settingsFile } from '../lib/paths'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from '../lib/jsonStore'

const GAME_IDS: GameId[] = ['pokemon', 'onepiece', 'riftbound']

// Only known keys with the right types get through, so a stale or hand-edited
// settings file can't feed the renderer something it doesn't expect.
function sanitize(raw: unknown): AppSettings {
  const source = (isPlainObject(raw) ? raw : {}) as Record<string, unknown>
  const settings: AppSettings = {}
  if (typeof source.lastGameId === 'string' && GAME_IDS.includes(source.lastGameId as GameId)) {
    settings.lastGameId = source.lastGameId as GameId
  }
  if (typeof source.lastDeckId === 'string' || source.lastDeckId === null) settings.lastDeckId = source.lastDeckId
  if (source.deckSort === 'recent' || source.deckSort === 'name') settings.deckSort = source.deckSort
  return settings
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    return sanitize(await readJsonFile<unknown>(settingsFile(), {}, isPlainObject))
  })

  ipcMain.handle('settings:set', (_e, patch: AppSettings): Promise<AppSettings> =>
    withLock('settings', async () => {
      const current = sanitize(await readJsonFile<unknown>(settingsFile(), {}, isPlainObject))
      const next = sanitize({ ...current, ...patch })
      await writeJsonAtomic(settingsFile(), next)
      return next
    }),
  )
}
