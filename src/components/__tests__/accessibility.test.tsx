// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactElement } from 'react'
import { makeCard, makeDeck } from '../../shared/testFixtures'
import { getAdapter } from '../../shared/games/registry'

/**
 * Accessibility: each main screen rendered with some data, then checked with axe (the rules browser
 * extensions and Lighthouse use). Colour contrast needs real layout, which happy-dom doesn't do, so
 * themes.test.ts checks it from the theme colours instead (and the end-to-end tests in the browser).
 * "region" (everything inside a landmark) is about a whole page, not one screen on its own: the
 * end-to-end tests check it on the real app.
 */

/** Every window.api call resolves to nothing, so screens render without the desktop or phone backend. */
const api: unknown = new Proxy(() => Promise.resolve(undefined), {
  get: (_t, key) => (key === 'then' ? undefined : api),
  apply: () => Promise.resolve(undefined),
})
;(window as unknown as { api: unknown }).api = api
vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

const { useAppStore } = await import('../../state/useAppStore')
const { Sidebar } = await import('../Sidebar')
const { CardBrowser } = await import('../CardBrowser')
const { DeckPanel } = await import('../DeckPanel')
const { MyDecksPanel } = await import('../MyDecksPanel')
const { CollectionPanel } = await import('../CollectionPanel')
const { WishlistPanel } = await import('../WishlistPanel')
const { CommandPalette } = await import('../CommandPalette')
const { SampleHandModal } = await import('../SampleHandModal')
const { BanListUpdateModal } = await import('../BanListUpdateModal')
const { DeckFullView } = await import('../DeckFullView')

const leader = makeCard('onepiece', { name: 'Nico Robin', sourceId: 'EB05-010', category: 'Leader', colors: ['Purple'], imageUrlSmall: 'x.png', imageUrl: 'x.png' })
const nami = makeCard('onepiece', { name: 'Nami', sourceId: 'EB05-055', category: 'Character', colors: ['Purple'], cost: '2', price: 1.5, imageUrlSmall: 'n.png', imageUrl: 'n.png' })
const deck = { ...makeDeck('onepiece', { leader: [[leader, 1]], main: [[nami, 4]] }), id: 'd1', name: 'Purple Robin' }
const cards = [leader, nami]

beforeEach(() => {
  useAppStore.setState({
    currentGameId: 'onepiece',
    currentDeckId: 'd1',
    decks: [deck],
    catalogs: { onepiece: { cards, byId: new Map(cards.map((c) => [c.id, c])) } },
    syncMeta: { onepiece: { gameId: 'onepiece', count: 2, lastSynced: '2026-11-01T00:00:00Z' } },
    collection: { [nami.id]: 2 },
    wishlist: [{ cardId: nami.id, gameId: 'onepiece', quantity: 2, addedAt: '2026-11-01T00:00:00Z' }],
    banListUpdates: [
      {
        gameId: 'onepiece',
        formatId: 'standard',
        formatLabel: 'Standard',
        changes: [{ key: 'onepiece:EB05-055', name: 'Nami', from: 'legal', to: 'banned' }],
        pairsAdded: [],
        pairsRemoved: [],
        setsRotatedOut: [],
        setsBack: [],
        decks: ['Purple Robin'],
      },
    ],
    settings: {},
    pawmodoroConfig: { url: '', anonKey: '', email: '', connected: false },
    pairingsConfig: { email: '', connected: false },
  } as never)
})

afterEach(cleanup)

async function violations(ui: ReactElement) {
  render(ui)
  // Modals render into document.body, so check the whole page.
  const result = await axe.run(document.body, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    resultTypes: ['violations'],
  })
  return result.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
}

const noop = () => {}

describe('accessibility (axe)', () => {
  it.each([
    ['the sidebar', () => <Sidebar />],
    ['the card browser', () => <CardBrowser />],
    ['the deck editor', () => <DeckPanel />],
    ['a deck view', () => <DeckFullView deck={deck} format={getAdapter('onepiece').defaultFormats[0]} cardsById={new Map(cards.map((c) => [c.id, c]))} onEdit={noop} />],
    ['My Decks', () => <MyDecksPanel />],
    ['the collection', () => <CollectionPanel />],
    ['the wishlist', () => <WishlistPanel />],
    ['the command palette', () => <CommandPalette onClose={noop} />],
    ['Practice', () => <SampleHandModal deck={deck} cardsById={new Map(cards.map((c) => [c.id, c]))} handSize={5} onClose={noop} />],
    ['a ban list update', () => <BanListUpdateModal />],
  ])('%s has no violations', async (_name, ui) => {
    expect(await violations(ui())).toEqual([])
  })
})
