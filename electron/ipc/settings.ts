import { ipcMain } from 'electron'
import type { AppSettings, GameId } from '../../src/shared/types'
import { GAME_LIST } from '../../src/shared/games/registry'
import { isDeckViewMode } from '../../src/shared/deckView'
import { isThemeId } from '../../src/shared/themes'
import { isDeckSortMode } from '../../src/shared/deckOrder'
import { settingsFile } from '../lib/paths'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from '../lib/jsonStore'

const GAME_IDS: GameId[] = GAME_LIST.map((adapter) => adapter.id)

// Only known keys with the right types get through, so a stale or hand-edited
// settings file can't feed the renderer something it doesn't expect.
function sanitize(raw: unknown): AppSettings {
  const source = (isPlainObject(raw) ? raw : {}) as Record<string, unknown>
  const settings: AppSettings = {}
  if (typeof source.lastGameId === 'string' && GAME_IDS.includes(source.lastGameId as GameId)) {
    settings.lastGameId = source.lastGameId as GameId
  }
  if (typeof source.lastDeckId === 'string' || source.lastDeckId === null) settings.lastDeckId = source.lastDeckId
  if (isDeckSortMode(source.deckSort)) settings.deckSort = source.deckSort
  if (Array.isArray(source.gameOrder)) settings.gameOrder = [...new Set(source.gameOrder)].filter((id): id is GameId => GAME_IDS.includes(id as GameId))
  if (Array.isArray(source.deckOrder)) settings.deckOrder = [...new Set(source.deckOrder.filter((id): id is string => typeof id === 'string'))].slice(0, 5000)
  if (isDeckViewMode(source.deckViewMode)) settings.deckViewMode = source.deckViewMode
  if (isThemeId(source.theme)) settings.theme = source.theme
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
