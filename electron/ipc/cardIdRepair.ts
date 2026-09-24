import { ipcMain } from 'electron'
import { applyIdRepairs, type RepairableData } from '../../src/shared/cardIdRepair'
import {
  readBinders, readCollection, readDecks, readForTrade, readWishlist, withDataLock,
  writeBinders, writeCollection, writeDecks, writeForTrade, writeWishlist,
} from '../lib/dataFiles'
import { snapshot } from '../lib/backups'
import { enqueueSyncOp, lookupCardNameAndSet } from './deckbuilderSync'

// Points stale card ids (see shared/cardIdRepair.ts) at current cards in every data file, in one locked
// pass so no edit can land in between. A backup snapshot is taken first, so the repair itself can be
// undone with Restore… if it ever picked the wrong printing.
export function registerCardIdRepairIpc(): void {
  ipcMain.handle('data:repairCardIds', (_e, pairs: [string, string][]): Promise<RepairableData & { repaired: number }> =>
    withDataLock(async () => {
      const input: RepairableData = {
        decks: await readDecks(), binders: await readBinders(), collection: await readCollection(),
        forTrade: await readForTrade(), wishlist: await readWishlist(),
      }
      const result = applyIdRepairs(input, new Map(pairs))
      if (result.repaired === 0 && result.forTradeChanges.length === 0) return { ...input, repaired: 0 }

      await snapshot('auto')
      const { data } = result
      if (result.changedDeckIds.length) await writeDecks(data.decks)
      if (result.changedBinderIds.length) await writeBinders(data.binders)
      if (result.collectionChanges.length) await writeCollection(data.collection)
      if (result.forTradeChanges.length) await writeForTrade(data.forTrade)
      if (result.wishlistChanges.length) await writeWishlist(data.wishlist)

      for (const deck of data.decks.filter((d) => result.changedDeckIds.includes(d.id))) {
        enqueueSyncOp({ type: 'save_deck', id: deck.id, gameId: deck.gameId, data: deck })
      }
      for (const binder of data.binders.filter((b) => result.changedBinderIds.includes(b.id))) {
        enqueueSyncOp({ type: 'save_binder', id: binder.id, data: binder })
      }
      for (const { cardId, quantity } of result.collectionChanges) {
        const { name, setCode, gameId } = await lookupCardNameAndSet(cardId)
        enqueueSyncOp({ type: 'set_collection_quantity', gameId, cardId, cardName: name, setCode, quantity })
      }
      for (const { cardId, forTrade } of result.forTradeChanges) {
        const { gameId } = await lookupCardNameAndSet(cardId)
        enqueueSyncOp({ type: 'set_for_trade', gameId, cardId, forTrade })
      }
      for (const { cardId, quantity } of result.wishlistChanges) {
        const { name, gameId } = await lookupCardNameAndSet(cardId)
        enqueueSyncOp({ type: 'wishlist_set_quantity', gameId, cardId, cardName: name, quantity })
      }
      return { ...data, repaired: result.repaired }
    }),
  )
}
