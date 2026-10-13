// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

/** A RiftAtlas Decks page with one finish: a version 5 code of 3 Sett, Brawler (VEN-SP1) and 3 Fury runes. */
const CODE = 'CUAQCAYBAICQAAQBAEAQAAA'
const data = {
  labels: { 'VEN-155': { name: 'Kennen, Heart of the Tempest' } },
  details: { kennen: { finishes: [{ eventId: 'e', eventName: 'Challenger #5', startDate: '2026-10-11T16:00:00.000Z', players: 46, rank: 1, player: 'flolcsc', legendId: 'VEN-155', hasDeck: true, deckCode: CODE }] } },
}
const html = `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(data))}])</script>`
;(window as unknown as { api: object }).api = { fetchCommunityLists: vi.fn(async () => html), clipboard: { writeText: vi.fn(async () => {}) }, system: { openExternal: vi.fn() } }

const { useAppStore } = await import('../../state/useAppStore')
const { CommunityListsModal } = await import('../CommunityListsModal')

afterEach(cleanup)

describe('Community lists', () => {
  it('shows finishes by event with their Legend, and imports one', async () => {
    const cards = [
      makeCard('riftbound', { name: 'Kennen, Heart of the Tempest', sourceId: 'ven-155-166', category: 'Legend', colors: ['Order', 'Chaos'], imageUrl: 'https://img/kennen.png' }),
      makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006', category: 'Unit' }),
    ]
    useAppStore.setState({ catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } } } as never)
    const onImport = vi.fn()
    render(<CommunityListsModal onImport={onImport} onClose={() => {}} />)
    const legend = await screen.findByText('Kennen, Heart of the Tempest')
    expect(screen.getByText('Challenger #5')).toBeTruthy()
    expect(document.querySelector('.community-rank.gold')?.textContent).toBe('1')
    expect(document.querySelector('.community-legend-art img')?.getAttribute('src')).toBe('https://img/kennen.png')
    fireEvent.click(legend.closest('button')!)
    expect(screen.getByText('Sett, Brawler')).toBeTruthy()
    fireEvent.click(screen.getByText(t.communityLists.import))
    expect(onImport).toHaveBeenCalledWith('MainDeck:\n3 ven-sp1-006 Sett, Brawler\n\nRunes:\n3 Fury Rune', 'Kennen, Heart of the Tempest – flolcsc #1')
  })
})
