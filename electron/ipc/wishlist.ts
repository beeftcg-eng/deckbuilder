import { ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { WishlistEntry, GameId } from '../../src/shared/types'
import { wishlistFile } from '../lib/paths'

async function readWishlist(): Promise<WishlistEntry[]> {
  const path = wishlistFile()
  if (!existsSync(path)) return []
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as WishlistEntry[]
  } catch {
    return []
  }
}

async function writeWishlist(entries: WishlistEntry[]): Promise<void> {
  await writeFile(wishlistFile(), JSON.stringify(entries, null, 2), 'utf-8')
}

export function registerWishlistIpc(): void {
  ipcMain.handle('wishlist:list', async (): Promise<WishlistEntry[]> => readWishlist())

  ipcMain.handle(
    'wishlist:add',
    async (_e, gameId: GameId, cardId: string, quantity: number): Promise<WishlistEntry[]> => {
      const entries = await readWishlist()
      const existing = entries.find((e) => e.gameId === gameId && e.cardId === cardId)
      if (existing) {
        existing.quantity += quantity
      } else {
        entries.push({ id: randomUUID(), gameId, cardId, quantity, addedAt: new Date().toISOString(), pushedTaskId: null })
      }
      await writeWishlist(entries)
      return entries
    },
  )

  ipcMain.handle('wishlist:setQuantity', async (_e, entryId: string, quantity: number): Promise<WishlistEntry[]> => {
    let entries = await readWishlist()
    if (quantity <= 0) {
      entries = entries.filter((e) => e.id !== entryId)
    } else {
      const entry = entries.find((e) => e.id === entryId)
      if (entry) entry.quantity = quantity
    }
    await writeWishlist(entries)
    return entries
  })

  ipcMain.handle('wishlist:remove', async (_e, entryId: string): Promise<WishlistEntry[]> => {
    const entries = (await readWishlist()).filter((e) => e.id !== entryId)
    await writeWishlist(entries)
    return entries
  })

  ipcMain.handle(
    'wishlist:markPushed',
    async (_e, results: { entryId: string; taskId: string }[]): Promise<WishlistEntry[]> => {
      const entries = await readWishlist()
      for (const { entryId, taskId } of results) {
        const entry = entries.find((e) => e.id === entryId)
        if (entry) entry.pushedTaskId = taskId
      }
      await writeWishlist(entries)
      return entries
    },
  )
}
