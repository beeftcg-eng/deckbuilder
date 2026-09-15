import { ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Deck } from '../../src/shared/types'
import { decksFile } from '../lib/paths'
import { ensureDataDirs } from '../lib/paths'

async function readDecks(): Promise<Deck[]> {
  const path = decksFile()
  if (!existsSync(path)) return []
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as Deck[]
  } catch {
    return []
  }
}

async function writeDecks(decks: Deck[]): Promise<void> {
  await ensureDataDirs()
  await writeFile(decksFile(), JSON.stringify(decks, null, 2), 'utf-8')
}

export function registerDecksIpc(): void {
  ipcMain.handle('decks:list', async (): Promise<Deck[]> => readDecks())

  ipcMain.handle('decks:save', async (_e, deck: Deck): Promise<Deck> => {
    const decks = await readDecks()
    const now = new Date().toISOString()
    const index = decks.findIndex((d) => d.id === deck.id)

    if (index === -1) {
      const created: Deck = { ...deck, id: deck.id || randomUUID(), createdAt: now, updatedAt: now }
      decks.push(created)
      await writeDecks(decks)
      return created
    }

    const updated: Deck = { ...deck, createdAt: decks[index].createdAt, updatedAt: now }
    decks[index] = updated
    await writeDecks(decks)
    return updated
  })

  ipcMain.handle('decks:delete', async (_e, deckId: string): Promise<void> => {
    const decks = await readDecks()
    await writeDecks(decks.filter((d) => d.id !== deckId))
  })
}
