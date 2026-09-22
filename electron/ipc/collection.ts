import { ipcMain } from 'electron'
import type { Collection } from '../../src/shared/types'
import { readCollection, readForTrade, withDataLock, writeCollection, writeForTrade } from '../lib/dataFiles'
import { enqueueSyncOp, lookupCardNameAndSet } from './deckbuilderSync'

const MAX_OWNED = 999

function clampQuantity(quantity: number): number {
  return Math.min(MAX_OWNED, Math.max(0, Math.floor(Number(quantity) || 0)))
}

export function registerCollectionIpc(): void {
  ipcMain.handle('collection:get', (): Promise<Collection> => withDataLock(readCollection))

  // Adds copies on top of what's already owned; a negative quantity removes copies (never below 0, and
  // 0 drops the entry). Relative on purpose: the +/− steppers send ±1, so two quick clicks both count.
  ipcMain.handle('collection:add', (_e, items: { cardId: string; quantity: number }[]): Promise<Collection> =>
    withDataLock(async () => {
      const collection = await readCollection()
      const droppedIds: string[] = []
      const changed: { cardId: string; quantity: number }[] = []
      for (const { cardId, quantity } of items) {
        const next = clampQuantity((collection[cardId] ?? 0) + quantity)
        if (next === 0) {
          delete collection[cardId]
          droppedIds.push(cardId)
        } else collection[cardId] = next
        changed.push({ cardId, quantity: next })
      }
      await writeCollection(collection)
      // A card that's no longer owned can't stay marked "for trade".
      if (droppedIds.length > 0) {
        const forTrade = await readForTrade()
        const next = forTrade.filter((id) => !droppedIds.includes(id))
        if (next.length !== forTrade.length) await writeForTrade(next)
      }
      for (const { cardId, quantity } of changed) {
        const { name, setCode, gameId } = await lookupCardNameAndSet(cardId)
        enqueueSyncOp({ type: 'set_collection_quantity', gameId, cardId, cardName: name, setCode, quantity })
      }
      return collection
    }),
  )

  ipcMain.handle('collection:getForTrade', (): Promise<string[]> => withDataLock(readForTrade))

  ipcMain.handle('collection:setForTrade', (_e, cardId: string, forTrade: boolean): Promise<string[]> =>
    withDataLock(async () => {
      const current = await readForTrade()
      const next = forTrade ? [...new Set([...current, cardId])] : current.filter((id) => id !== cardId)
      await writeForTrade(next)
      const { gameId } = await lookupCardNameAndSet(cardId)
      enqueueSyncOp({ type: 'set_for_trade', gameId, cardId, forTrade })
      return next
    }),
  )
}
