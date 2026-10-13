// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
const api = { settings: { set: vi.fn(async (patch: object) => patch) }, fetchCommunityPage: vi.fn() }
;(window as unknown as { api: object }).api = api

const { useAppStore } = await import('../../state/useAppStore')
const { DeckMetaCompare } = await import('../DeckMetaCompare')

afterEach(cleanup)

describe('Against the meta', () => {
  it("shows the staples a deck skips and its unusual picks, and opts in to its Legend's new lists", async () => {
    const kennen = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', sourceId: 'ven-155-166', category: 'Legend' })
    const sett = makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006' })
    const odd = makeCard('riftbound', { name: 'Odd Pick', sourceId: 'ogn-001-298' })
    const cards = [kennen, sett, odd]
    useAppStore.setState({ catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } }, settings: {} } as never)
    const deck: Deck = {
      id: 'd', gameId: 'riftbound', name: 'K', formatId: 'constructed', freeTextZones: {}, createdAt: '', updatedAt: '',
      zones: { legend: [{ cardId: kennen.id, quantity: 1 }], main: [{ cardId: odd.id, quantity: 2 }] },
    }
    render(<DeckMetaCompare deck={deck} />)
    expect(fetch).not.toHaveBeenCalled() // closed: nothing read
    fireEvent.click(screen.getByText(new RegExp(t.communityLists.vsMetaHeading)))
    expect(await screen.findByText(t.communityLists.vsMetaTitle(5), { exact: false })).toBeTruthy()
    expect(screen.getByText(t.communityLists.vsMetaMissing)).toBeTruthy()
    expect(screen.getByText(/Sett, Brawler/)).toBeTruthy()
    expect(screen.getByText(/Odd Pick/)).toBeTruthy()

    const toggle = screen.getByText(t.communityLists.alertOff)
    expect(toggle.getAttribute('aria-pressed')).toBe('false') // off until you opt in
    fireEvent.click(toggle)
    expect(useAppStore.getState().settings.listAlerts).toEqual({ legends: ['VEN-155'], seenEvents: ['e0', 'e1'] })
    expect(screen.getByText(t.communityLists.alertOn)).toBeTruthy()
  })
})
