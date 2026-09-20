import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { WishlistEntry, GameId } from '../../src/shared/types'
import { readWishlist, withDataLock, writeWishlist } from '../lib/dataFiles'

function addOrIncrement(entries: WishlistEntry[], gameId: GameId, cardId: string, quantity: number): void {
  const existing = entries.find((e) => e.gameId === gameId && e.cardId === cardId)
  if (existing) {
    existing.quantity += quantity
  } else {
    entries.push({ id: randomUUID(), gameId, cardId, quantity, addedAt: new Date().toISOString(), pushedTaskId: null })
  }
}

export function registerWishlistIpc(): void {
  ipcMain.handle('wishlist:list', (): Promise<WishlistEntry[]> => withDataLock(readWishlist))

  ipcMain.handle('wishlist:add', (_e, gameId: GameId, cardId: string, quantity: number): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      const entries = await readWishlist()
      addOrIncrement(entries, gameId, cardId, quantity)
      await writeWishlist(entries)
      return entries
    }),
  )

  ipcMain.handle(
    'wishlist:addMany',
    (_e, items: { gameId: GameId; cardId: string; quantity: number }[]): Promise<WishlistEntry[]> =>
      withDataLock(async () => {
        const entries = await readWishlist()
        for (const { gameId, cardId, quantity } of items) addOrIncrement(entries, gameId, cardId, quantity)
        await writeWishlist(entries)
        return entries
      }),
  )

  ipcMain.handle('wishlist:setQuantity', (_e, entryId: string, quantity: number): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      let entries = await readWishlist()
      if (quantity <= 0) {
        entries = entries.filter((e) => e.id !== entryId)
      } else {
        const entry = entries.find((e) => e.id === entryId)
        if (entry) entry.quantity = quantity
      }
      await writeWishlist(entries)
      return entries
    }),
  )

  ipcMain.handle('wishlist:remove', (_e, entryId: string): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      const entries = (await readWishlist()).filter((e) => e.id !== entryId)
      await writeWishlist(entries)
      return entries
    }),
  )

  ipcMain.handle('wishlist:markPushed', (_e, results: { entryId: string; taskId: string }[]): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      const entries = await readWishlist()
      for (const { entryId, taskId } of results) {
        const entry = entries.find((e) => e.id === entryId)
        if (entry) entry.pushedTaskId = taskId
      }
      await writeWishlist(entries)
      return entries
    }),
  )
}
