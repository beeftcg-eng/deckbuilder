// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Deck } from '../../shared/types'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

/** One RiftAtlas finish with Kennen: 1 Kennen (VEN-155) and 3 Sett, Brawler (VEN-SP1). */
const data = {
  labels: {},
  details: { kennen: { finishes: [{ eventId: 'e', eventName: 'Challenger', rank: 1, legendId: 'VEN-155', hasDeck: true, deckCode: 'CUAQEAYBAECQAAQBAEAQCBIAACNQCAAA' }] } },
}
const html = `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(data))}])</script>`
const saved: Deck[] = []
;(window as unknown as { api: object }).api = {
  fetchCommunityPage: vi.fn(async (url: string) => (url.includes('/events/') ? '' : html)),
  decks: { save: vi.fn(async (deck: Deck) => (saved.push(deck), deck)) },
}

const { useAppStore } = await import('../../state/useAppStore')
const { CommunityStartHint } = await import('../CommunityStartHint')

afterEach(cleanup)
// No published file: the desktop app reads RiftAtlas itself.
vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

describe("Starting a deck from its Legend's lists", () => {
  it('offers the lists for a deck with only its Legend, and fills it', async () => {
    const kennen = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', sourceId: 'ven-155-166', category: 'Legend', colors: ['Order'] })
    const sett = makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006' })
    const deck: Deck = {
      id: 'd',
      gameId: 'riftbound',
      name: 'Kennen',
      formatId: 'constructed',
      zones: { legend: [{ cardId: kennen.id, quantity: 1 }] },
      freeTextZones: {},
      createdAt: '',
      updatedAt: '',
    }
    useAppStore.setState({
      catalogs: { riftbound: { cards: [kennen, sett], byId: new Map([kennen, sett].map((c) => [c.id, c])) } },
      decks: [deck],
      currentDeckId: 'd',
      currentGameId: 'riftbound',
    } as never)
    render(<CommunityStartHint deck={deck} />)
    expect(await screen.findByText(t.communityLists.hintBody(1))).toBeTruthy()
    fireEvent.click(screen.getByText(t.communityLists.hintNewest))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].zones).toEqual({ legend: [{ cardId: kennen.id, quantity: 1 }], main: [{ cardId: sett.id, quantity: 3 }] })
  })
})
