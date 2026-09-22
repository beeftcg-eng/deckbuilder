import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Deck } from '../../src/shared/types'
import { readDecks, withDataLock, writeDecks } from '../lib/dataFiles'
import { enqueueSyncOp } from './deckbuilderSync'

export function registerDecksIpc(): void {
  ipcMain.handle('decks:list', (): Promise<Deck[]> => withDataLock(readDecks))

  // Every save carries the whole deck, and the renderer applies edits
  // optimistically, so saves must be applied one at a time in the order they
  // arrive (withDataLock) or a slow earlier write could land after a later one.
  ipcMain.handle('decks:save', (_e, deck: Deck, options?: { keepUpdatedAt?: boolean }): Promise<Deck> =>
    withDataLock(async () => {
      const decks = await readDecks()
      const now = new Date().toISOString()
      const index = decks.findIndex((d) => d.id === deck.id)

      if (index === -1) {
        // Keep a supplied createdAt so restoring a deleted deck (undo) doesn't reset its age.
        const created: Deck = { ...deck, id: deck.id || randomUUID(), createdAt: deck.createdAt || now, updatedAt: now }
        decks.push(created)
        await writeDecks(decks)
        enqueueSyncOp({ type: 'save_deck', id: created.id, gameId: created.gameId, data: created })
        return created
      }

      // Locking a deck isn't editing it, so it keeps its "last changed" time (and its place in the Recent sort).
      const updated: Deck = { ...deck, createdAt: decks[index].createdAt, updatedAt: options?.keepUpdatedAt ? decks[index].updatedAt : now }
      decks[index] = updated
      await writeDecks(decks)
      enqueueSyncOp({ type: 'save_deck', id: updated.id, gameId: updated.gameId, data: updated })
      return updated
    }),
  )

  ipcMain.handle('decks:delete', (_e, deckId: string): Promise<void> =>
    withDataLock(async () => {
      const decks = await readDecks()
      await writeDecks(decks.filter((d) => d.id !== deckId))
      enqueueSyncOp({ type: 'delete_deck', id: deckId })
    }),
  )
}
