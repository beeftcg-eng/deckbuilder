import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, Deck } from '../shared/types'

/** The store talks to the main process through window.api; this stands in for it. */
const saved = new Map<string, Deck>()
let settings: AppSettings = {}
const api = {
  decks: {
    save: vi.fn(async (deck: Deck) => {
      saved.set(deck.id, structuredClone(deck))
      return deck
    }),
    delete: vi.fn(async (id: string) => {
      saved.delete(id)
    }),
  },
  settings: {
    set: vi.fn(async (patch: AppSettings) => {
      settings = { ...settings, ...patch }
      return settings
    }),
  },
}
;(globalThis as unknown as { window: unknown }).window = { api }

const { useAppStore } = await import('./useAppStore')

function deck(id: string, over: Partial<Deck> = {}): Deck {
  return {
    id,
    name: `Deck ${id}`,
    gameId: 'riftbound',
    formatId: 'standard',
    zones: { main: [{ cardId: 'c1', quantity: 2 }] },
    freeTextZones: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

const store = () => useAppStore.getState()
const find = (id: string) => store().decks.find((d) => d.id === id)

beforeEach(() => {
  saved.clear()
  settings = {}
  vi.clearAllMocks()
  useAppStore.setState({
    decks: [deck('a'), deck('b')],
    currentDeckId: 'a',
    currentGameId: 'riftbound',
    deckViewing: false,
    undoStack: [],
    error: null,
    settings: {},
  })
})

describe('locking a deck', () => {
  it('locks and unlocks, saving the flag with the deck', async () => {
    await store().setDeckLocked('a', true)
    expect(find('a')?.locked).toBe(true)
    expect(saved.get('a')?.locked).toBe(true)

    await store().setDeckLocked('a', false)
    expect(find('a')?.locked).toBeUndefined()
    expect(saved.get('a')?.locked).toBeUndefined()
  })

  it('saves the lock without counting it as an edit (the deck keeps its "last changed" time)', async () => {
    await store().setDeckLocked('a', true)
    expect(api.decks.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', locked: true }), { keepUpdatedAt: true })
  })

  it('leaves other decks alone and does not save when nothing changes', async () => {
    await store().setDeckLocked('a', false)
    expect(api.decks.save).not.toHaveBeenCalled()
    await store().setDeckLocked('a', true)
    expect(find('b')?.locked).toBeUndefined()
  })

  it('refuses edits to a locked deck, and says why', async () => {
    await store().setDeckLocked('a', true)
    await store().updateDeck((d) => ({ ...d, name: 'Renamed' }), 'Rename')
    expect(find('a')?.name).toBe('Deck a')
    expect(store().error).toMatch(/locked/i)
    expect(store().undoStack).toHaveLength(0)
  })

  it('refuses to delete a locked deck until it is unlocked', async () => {
    await store().setDeckLocked('a', true)
    await store().deleteDeck('a')
    expect(find('a')).toBeDefined()
    expect(api.decks.delete).not.toHaveBeenCalled()

    await store().setDeckLocked('a', false)
    await store().deleteDeck('a')
    expect(find('a')).toBeUndefined()
  })

  it('edits normally once unlocked again', async () => {
    await store().setDeckLocked('a', true)
    await store().setDeckLocked('a', false)
    await store().updateDeck((d) => ({ ...d, name: 'Renamed' }), 'Rename')
    expect(find('a')?.name).toBe('Renamed')
  })

  it('will not undo a change on a deck that has since been locked, and keeps it for after unlocking', async () => {
    await store().updateDeck((d) => ({ ...d, name: 'Renamed' }), 'Rename')
    await store().setDeckLocked('a', true)
    await store().undo()
    expect(find('a')?.name).toBe('Renamed')
    expect(store().undoStack).toHaveLength(1)

    await store().setDeckLocked('a', false)
    await store().undo()
    expect(find('a')?.name).toBe('Deck a')
    expect(store().undoStack).toHaveLength(0)
  })

  it('duplicates a locked deck as an unlocked copy', async () => {
    await store().setDeckLocked('a', true)
    await store().duplicateDeck('a')
    const copy = store().decks.find((d) => d.name === 'Deck a (copy)')
    expect(copy).toBeDefined()
    expect(copy?.locked).toBeUndefined()
    expect(find('a')?.locked).toBe(true)
  })
})

describe('opening a deck', () => {
  it('shows the deck view when a deck is selected or opened', () => {
    store().selectDeck('b')
    expect(store().deckViewing).toBe(true)

    store().setDeckViewing(false)
    store().openDeck('a')
    expect(store().deckViewing).toBe(true)
    expect(store().currentDeckId).toBe('a')
  })

  it('goes to the editor for a new deck or a duplicate, and back to the view on demand', async () => {
    store().selectDeck('a')
    await store().duplicateDeck('a')
    expect(store().deckViewing).toBe(false)

    store().setDeckViewing(true)
    store().setDeckViewing(false)
    expect(store().deckViewing).toBe(false)
  })
})

describe('game order', () => {
  it('saves the order you arranged', () => {
    store().setGameOrder(['mtg', 'yugioh', 'pokemon', 'onepiece', 'riftbound'])
    expect(store().settings.gameOrder).toEqual(['mtg', 'yugioh', 'pokemon', 'onepiece', 'riftbound'])
    expect(api.settings.set).toHaveBeenCalledWith({ gameOrder: ['mtg', 'yugioh', 'pokemon', 'onepiece', 'riftbound'] })
  })
})
