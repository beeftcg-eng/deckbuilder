// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { AppSettings, Collection } from '../../shared/types'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

/**
 * The collection flows where a slip loses data: marking foils, deleting cards in bulk, and undoing
 * that delete. window.api stands in for the desktop app's main process (or the phone app's storage).
 */
let collection: Collection = {}
let settings: AppSettings = {}
const api = {
  collection: {
    add: vi.fn(async (items: { cardId: string; quantity: number }[]) => {
      const next = { ...collection }
      for (const { cardId, quantity } of items) {
        const n = (next[cardId] ?? 0) + quantity
        if (n > 0) next[cardId] = n
        else delete next[cardId]
      }
      collection = next
      return collection
    }),
  },
  settings: {
    set: vi.fn(async (patch: AppSettings) => {
      settings = { ...settings, ...patch }
      return settings
    }),
  },
}
;(window as unknown as { api: typeof api }).api = api

const { useAppStore } = await import('../../state/useAppStore')
const { CollectionPanel } = await import('../CollectionPanel')

const bolt = makeCard('mtg', { name: 'Lightning Bolt', price: 2, foilPrice: 10 })
const negate = makeCard('mtg', { name: 'Negate', price: 1 })

beforeEach(() => {
  collection = { [bolt.id]: 3, [negate.id]: 1 }
  settings = {}
  window.confirm = () => true
  useAppStore.setState({
    currentGameId: 'mtg',
    catalogs: { mtg: { cards: [bolt, negate], byId: new Map([bolt, negate].map((c) => [c.id, c])) } },
    collection,
    settings: {},
  })
})
afterEach(cleanup)

function row(name: string): HTMLElement {
  return screen.getByText(name).closest('.col-row') as HTMLElement
}

describe('Collection panel', () => {
  it('marks a copy as foil, and counts it at the foil price', async () => {
    render(<CollectionPanel />)
    fireEvent.click(within(row('Lightning Bolt')).getByText(t.copyDetails.button))
    // The dialog's code loads when it first opens.
    fireEvent.click(await screen.findByText(t.copyDetails.add))
    fireEvent.click(screen.getByText(t.copyDetails.save))

    expect(useAppStore.getState().settings.collectionDetails).toEqual({ [bolt.id]: [{ finish: 'foil', condition: 'NM', quantity: 1 }] })
    await waitFor(() => expect(settings.collectionDetails).toBeDefined())
    // Two plain copies at $2 and the foil at $10.
    expect(within(row('Lightning Bolt')).getByText(/14\.00/)).toBeTruthy()
    expect(within(row('Lightning Bolt')).getByText(`1 ${t.copyDetails.finishes.foil.toLowerCase()}`)).toBeTruthy()
  })

  it('deletes selected cards as one batch, and Undo brings them back with their copies', async () => {
    render(<CollectionPanel />)
    fireEvent.click(screen.getByText(t.collection.select))
    fireEvent.click(screen.getByText(t.collection.selectAll(2)))
    fireEvent.click(screen.getByText(t.collection.deleteSelected(2)))

    await waitFor(() => expect(useAppStore.getState().collection).toEqual({}))
    expect(api.collection.add).toHaveBeenLastCalledWith(expect.arrayContaining([{ cardId: bolt.id, quantity: -3 }, { cardId: negate.id, quantity: -1 }]))
    const [batch] = useAppStore.getState().settings.collectionBatches ?? []
    expect(batch.source).toBe('delete')

    fireEvent.click(await screen.findByText(t.collection.batches(1)))
    fireEvent.click(screen.getByText(t.collection.undo))
    await waitFor(() => expect(useAppStore.getState().collection).toEqual({ [bolt.id]: 3, [negate.id]: 1 }))
    expect(useAppStore.getState().settings.collectionBatches).toEqual([])
  })

  it('forgets finish details of cards that were deleted', async () => {
    useAppStore.getState().setCopyDetails(bolt.id, [{ finish: 'foil', condition: 'LP', quantity: 2 }])
    await useAppStore.getState().removeFromCollection('mtg', [bolt.id])
    expect(useAppStore.getState().settings.collectionDetails).toEqual({})
  })
})
