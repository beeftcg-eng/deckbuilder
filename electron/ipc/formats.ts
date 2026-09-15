import { ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { Format, GameId } from '../../src/shared/types'
import { GAME_LIST } from '../../src/shared/games/registry'
import { formatsFile, ensureDataDirs } from '../lib/paths'

type FormatsFile = Record<GameId, Format[]>

function defaultFormatsFile(): FormatsFile {
  const result = {} as FormatsFile
  for (const adapter of GAME_LIST) result[adapter.id] = adapter.defaultFormats
  return result
}

async function readFormatsFile(): Promise<FormatsFile> {
  const path = formatsFile()
  if (!existsSync(path)) {
    const defaults = defaultFormatsFile()
    await ensureDataDirs()
    await writeFile(path, JSON.stringify(defaults, null, 2), 'utf-8')
    return defaults
  }
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<FormatsFile>
    const defaults = defaultFormatsFile()
    // Fill in any game missing from a user-edited file (e.g. after adding a new game).
    for (const gameId of Object.keys(defaults) as GameId[]) {
      if (!parsed[gameId]) parsed[gameId] = defaults[gameId]
    }
    return parsed as FormatsFile
  } catch {
    return defaultFormatsFile()
  }
}

export function registerFormatsIpc(): void {
  ipcMain.handle('formats:list', async (_e, gameId: GameId): Promise<Format[]> => {
    const all = await readFormatsFile()
    return all[gameId] ?? []
  })

  ipcMain.handle('formats:path', async (): Promise<string> => {
    await readFormatsFile()
    return formatsFile()
  })
}
