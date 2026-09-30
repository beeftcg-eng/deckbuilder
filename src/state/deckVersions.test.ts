import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings, Deck } from '../shared/types'

/** The store talks to the main process through window.api; this stands in for it. */
const saved = new Map<string, Deck>()
const api = {
  decks: {
    // The main process stamps a save as "changed now".
    save: vi.fn(async (deck: Deck, options?: { keepUpdatedAt?: boolean }) => {
      const out = { ...deck, updatedAt: options?.keepUpdatedAt ? deck.updatedAt : new Date().toISOString() }
      saved.set(deck.id, structuredClone(out))
      return out
    }),
  },
  settings: { set: vi.fn(async (patch: AppSettings) => patch) },
}
;(globalThis as unknown as { window: unknown }).window = { api }

const { useAppStore } = await import('./useAppStore')

const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
const deck: Deck = {
  id: 'a',
  name: 'Burn',
  gameId: 'riftbound',
  formatId: 'standard',
  zones: { main: [{ cardId: 'riftbound:c1', quantity: 3 }] },
  freeTextZones: {},
  createdAt: lastWeek,
  updatedAt: lastWeek,
}
const store = () => useAppStore.getState()
const current = () => store().decks.find((d) => d.id === 'a')!

beforeEach(() => {
  saved.clear()
  useAppStore.setState({ decks: [structuredClone(deck)], currentDeckId: 'a', currentGameId: 'riftbound', undoStack: [], error: null, settings: {} })
})

describe('deck versions in the store', () => {
  it('saves the list as it stood before the first edit of a new session, and not again right after', async () => {
    await store().updateDeck((d) => ({ ...d, zones: { main: [{ cardId: 'riftbound:c1', quantity: 4 }] } }))
    expect(current().versions).toHaveLength(1)
    expect(current().versions![0].zones.main).toEqual([{ cardId: 'riftbound:c1', quantity: 3 }])
    expect(current().versions![0].at).toBe(lastWeek)

    await store().updateDeck((d) => ({ ...d, zones: { main: [{ cardId: 'riftbound:c2', quantity: 1 }] } }))
    expect(current().versions).toHaveLength(1)
    expect(saved.get('a')?.versions).toHaveLength(1)
  })

  it('goes back to a version, keeping the current list as one, and Undo reverses it', async () => {
    await store().updateDeck((d) => ({ ...d, zones: { main: [{ cardId: 'riftbound:c2', quantity: 2 }] } }))
    const [old] = current().versions!
    await store().restoreDeckVersion(old.id)
    expect(current().zones.main).toEqual([{ cardId: 'riftbound:c1', quantity: 3 }])
    expect(current().versions!.at(-1)!.zones.main).toEqual([{ cardId: 'riftbound:c2', quantity: 2 }])

    await store().undo()
    expect(current().zones.main).toEqual([{ cardId: 'riftbound:c2', quantity: 2 }])
  })

  it('names the current list, even on a locked deck', async () => {
    useAppStore.setState({ decks: [{ ...structuredClone(deck), locked: true }] })
    await store().saveDeckVersion('a', 'after regionals')
    expect(current().versions?.map((v) => v.name)).toEqual(['after regionals'])
    expect(api.decks.save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }), { keepUpdatedAt: true })
  })
})
