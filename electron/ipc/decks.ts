import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Deck } from '../../src/shared/types'
import { readDecks, withDataLock, writeDecks } from '../lib/dataFiles'

export function registerDecksIpc(): void {
  ipcMain.handle('decks:list', (): Promise<Deck[]> => withDataLock(readDecks))

  // Every save carries the whole deck, and the renderer applies edits
  // optimistically, so saves must be applied one at a time in the order they
  // arrive (withDataLock) or a slow earlier write could land after a later one.
  ipcMain.handle('decks:save', (_e, deck: Deck): Promise<Deck> =>
    withDataLock(async () => {
      const decks = await readDecks()
      const now = new Date().toISOString()
      const index = decks.findIndex((d) => d.id === deck.id)

      if (index === -1) {
        // Keep a supplied createdAt so restoring a deleted deck (undo) doesn't reset its age.
        const created: Deck = { ...deck, id: deck.id || randomUUID(), createdAt: deck.createdAt || now, updatedAt: now }
        decks.push(created)
        await writeDecks(decks)
        return created
      }

      const updated: Deck = { ...deck, createdAt: decks[index].createdAt, updatedAt: now }
      decks[index] = updated
      await writeDecks(decks)
      return updated
    }),
  )

  ipcMain.handle('decks:delete', (_e, deckId: string): Promise<void> =>
    withDataLock(async () => {
      const decks = await readDecks()
      await writeDecks(decks.filter((d) => d.id !== deckId))
    }),
  )
}
