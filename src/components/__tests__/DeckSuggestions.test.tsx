// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Deck } from '../../shared/types'
import type { CommunityList } from '../../shared/communityLists'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

/** 1 Kennen (VEN-155) and 3 Sett, Brawler (VEN-SP1). */
const KENNEN_CODE = 'CUAQEAYBAECQAAQBAEAQCBIAACNQCAAA'
const list = (i: number): CommunityList => ({
  id: `l${i}`, eventId: `e${i % 2}`, legendId: 'VEN-155', legendName: 'Kennen, Heart of the Tempest', eventName: 'Challenger',
  date: '2026-10-11T16:00:00.000Z', players: 46, rank: i + 1, player: `p${i}`, deckCode: KENNEN_CODE,
})
vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ updatedAt: new Date().toISOString(), lists: [0, 1, 2, 3, 4].map(list) }))))
;(window as unknown as { api: object }).api = { settings: { set: vi.fn(async (patch: object) => patch) }, fetchCommunityPage: vi.fn() }

const { useAppStore } = await import('../../state/useAppStore')
const { DeckSuggestions } = await import('../DeckSuggestions')

afterEach(cleanup)

describe('Suggestions from recent lists', () => {
  it('suggests what the lists play that the deck doesn’t, and adds it at its usual copies', async () => {
    const kennen = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', sourceId: 'ven-155-166', category: 'Legend' })
    const sett = makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006' })
    const odd = makeCard('riftbound', { name: 'Odd Pick', sourceId: 'ogn-001-298' })
    const cards = [kennen, sett, odd]
    const deck: Deck = {
      id: 'd', gameId: 'riftbound', name: 'K', formatId: 'constructed', freeTextZones: {}, createdAt: '', updatedAt: '',
      zones: { legend: [{ cardId: kennen.id, quantity: 1 }], main: [{ cardId: odd.id, quantity: 2 }] },
    }
    const setCardQuantity = vi.fn(async () => {})
    useAppStore.setState({ catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } }, settings: {}, setCardQuantity } as never)

    render(<DeckSuggestions deck={deck} />)
    expect(fetch).not.toHaveBeenCalled() // closed: nothing read
    fireEvent.click(screen.getByText(new RegExp(t.communityLists.suggestHeading)))
    expect(await screen.findByText(t.communityLists.suggestTitle(5), { exact: false })).toBeTruthy()
    expect(screen.getByText(/Sett, Brawler/)).toBeTruthy()
    expect(screen.queryByText(/Odd Pick/)).toBeNull() // already in the deck

    fireEvent.click(screen.getByLabelText(t.communityLists.suggestAddLabel(3, 'Sett, Brawler')))
    await waitFor(() => expect(setCardQuantity).toHaveBeenCalledWith('main', sett, 3))
  })
})
