import { ipcMain, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import type { Card, CardCacheMeta, GameId, SyncProgress } from '../../src/shared/types'
import { getAdapter } from '../../src/shared/games/registry'
import { cardsCacheDir, ensureDataDirs } from '../lib/paths'

interface CacheFile {
  cards: Card[]
  lastSynced: string
}

function cacheFilePath(gameId: GameId): string {
  return join(cardsCacheDir(), `${gameId}.json`)
}

async function readCache(gameId: GameId): Promise<CacheFile | null> {
  const path = cacheFilePath(gameId)
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as CacheFile
  } catch {
    return null
  }
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerCardDataIpc(): void {
  ipcMain.handle('cards:meta', async (_e, gameId: GameId): Promise<CardCacheMeta> => {
    const cache = await readCache(gameId)
    return { gameId, count: cache?.cards.length ?? 0, lastSynced: cache?.lastSynced ?? null }
  })

  ipcMain.handle('cards:load', async (_e, gameId: GameId): Promise<Card[]> => {
    const cache = await readCache(gameId)
    return cache?.cards ?? []
  })

  ipcMain.handle('cards:sync', async (_e, gameId: GameId): Promise<CardCacheMeta> => {
    await ensureDataDirs()
    const adapter = getAdapter(gameId)

    try {
      const cards = await adapter.fetchAllCards((p) => {
        const progress: SyncProgress = { gameId, loaded: p.loaded, total: p.total, done: false }
        broadcast('cards:syncProgress', progress)
      })

      const cache: CacheFile = { cards, lastSynced: new Date().toISOString() }
      await writeFile(cacheFilePath(gameId), JSON.stringify(cache), 'utf-8')

      broadcast('cards:syncProgress', { gameId, loaded: cards.length, total: cards.length, done: true } satisfies SyncProgress)
      return { gameId, count: cards.length, lastSynced: cache.lastSynced }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      broadcast('cards:syncProgress', { gameId, loaded: 0, total: 0, done: true, error: message } satisfies SyncProgress)
      throw err
    }
  })
}
