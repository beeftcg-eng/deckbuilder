import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { WishlistEntry, GameId } from '../../src/shared/types'
import { readWishlist, withDataLock, writeWishlist } from '../lib/dataFiles'
import { enqueueSyncOp, lookupCardNameAndSet } from './deckbuilderSync'

function addOrIncrement(entries: WishlistEntry[], gameId: GameId, cardId: string, quantity: number): WishlistEntry {
  const existing = entries.find((e) => e.gameId === gameId && e.cardId === cardId)
  if (existing) {
    existing.quantity += quantity
    return existing
  }
  const created = { id: randomUUID(), gameId, cardId, quantity, addedAt: new Date().toISOString(), pushedTaskId: null }
  entries.push(created)
  return created
}

async function enqueueWishlistSync(gameId: GameId, cardId: string, quantity: number): Promise<void> {
  const { name } = await lookupCardNameAndSet(cardId)
  enqueueSyncOp({ type: 'wishlist_set_quantity', gameId, cardId, cardName: name, quantity })
}

export function registerWishlistIpc(): void {
  ipcMain.handle('wishlist:list', (): Promise<WishlistEntry[]> => withDataLock(readWishlist))

  ipcMain.handle('wishlist:add', (_e, gameId: GameId, cardId: string, quantity: number): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      const entries = await readWishlist()
      const entry = addOrIncrement(entries, gameId, cardId, quantity)
      await writeWishlist(entries)
      await enqueueWishlistSync(gameId, cardId, entry.quantity)
      return entries
    }),
  )

  ipcMain.handle(
    'wishlist:addMany',
    (_e, items: { gameId: GameId; cardId: string; quantity: number }[]): Promise<WishlistEntry[]> =>
      withDataLock(async () => {
        const entries = await readWishlist()
        for (const { gameId, cardId, quantity } of items) {
          const entry = addOrIncrement(entries, gameId, cardId, quantity)
          await enqueueWishlistSync(gameId, cardId, entry.quantity)
        }
        await writeWishlist(entries)
        return entries
      }),
  )

  ipcMain.handle('wishlist:setQuantity', (_e, entryId: string, quantity: number): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      let entries = await readWishlist()
      const entry = entries.find((e) => e.id === entryId)
      if (quantity <= 0) {
        entries = entries.filter((e) => e.id !== entryId)
      } else if (entry) {
        entry.quantity = quantity
      }
      await writeWishlist(entries)
      if (entry) await enqueueWishlistSync(entry.gameId, entry.cardId, quantity)
      return entries
    }),
  )

  ipcMain.handle('wishlist:remove', (_e, entryId: string): Promise<WishlistEntry[]> =>
    withDataLock(async () => {
      const entries = await readWishlist()
      const entry = entries.find((e) => e.id === entryId)
      const next = entries.filter((e) => e.id !== entryId)
      await writeWishlist(next)
      if (entry) await enqueueWishlistSync(entry.gameId, entry.cardId, 0)
      return next
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
