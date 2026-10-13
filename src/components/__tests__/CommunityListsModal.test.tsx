// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'
import type { CommunityList, CommunityListsFile } from '../../shared/communityLists'

/** A version 5 code: 3 Sett, Brawler (VEN-SP1) and 3 Fury runes. */
const CODE = 'CUAQCAYBAICQAAQBAEAQAAA'
/** 1 Kennen (VEN-155) and 3 Sett, Brawler. */
const KENNEN_CODE = 'CUAQEAYBAECQAAQBAEAQCBIAACNQCAAA'
const data = {
  labels: { 'VEN-155': { name: 'Kennen, Heart of the Tempest' } },
  details: { kennen: { finishes: [{ eventId: 'e', eventName: 'Challenger #5', startDate: '2026-10-11T16:00:00.000Z', players: 46, rank: 1, player: 'flolcsc', legendId: 'VEN-155', hasDeck: true, deckCode: CODE }] } },
}
const html = `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify(data))}])</script>`

const list = (over: Partial<CommunityList>): CommunityList => ({
  id: 'x',
  eventId: 'e',
  legendId: 'VEN-155',
  legendName: 'Kennen, Heart of the Tempest',
  eventName: 'Challenger #5',
  date: '2026-10-11T16:00:00.000Z',
  players: 46,
  rank: 1,
  player: 'flolcsc',
  deckCode: KENNEN_CODE,
  ...over,
})

const api = {
  fetchCommunityPage: vi.fn(async (url: string) => (url.includes('/events/') ? '' : html)),
  clipboard: { writeText: vi.fn(async () => {}) },
  system: { openExternal: vi.fn() },
  settings: { set: vi.fn(async (patch: object) => patch) },
}
;(window as unknown as { api: object }).api = api

const { useAppStore } = await import('../../state/useAppStore')
const { resetCommunityLists } = await import('../../state/communityLists')
const { CommunityListsModal } = await import('../CommunityListsModal')

const kennen = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', sourceId: 'ven-155-166', category: 'Legend', colors: ['Order', 'Chaos'], imageUrl: 'https://img/kennen.png' })
const sett = makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006', price: 4 })
const published = (file: CommunityListsFile | null) =>
  vi.stubGlobal('fetch', vi.fn(async () => (file ? new Response(JSON.stringify(file)) : new Response('', { status: 404 }))))

beforeEach(() => {
  resetCommunityLists()
  localStorage.clear()
  api.fetchCommunityPage.mockClear()
  const cards = [kennen, sett]
  useAppStore.setState({ catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } }, collection: {}, decks: [], pairingsRecords: null, settings: {} } as never)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const open = (onImport = vi.fn()) => render(<CommunityListsModal onImport={onImport} onCompare={() => {}} onClose={() => {}} />)

describe('Community lists', () => {
  it('reads RiftAtlas itself when there is no published file, and imports a list', async () => {
    published(null)
    const onImport = vi.fn()
    open(onImport)
    const legend = await screen.findByText('Kennen, Heart of the Tempest')
    expect(api.fetchCommunityPage).toHaveBeenCalledWith('https://riftatlas.com/decks')
    expect(screen.getByText('Challenger #5')).toBeTruthy()
    expect(document.querySelector('.community-rank.gold')?.textContent).toBe('1')
    expect(document.querySelector('.community-legend-art img')?.getAttribute('src')).toBe('https://img/kennen.png')
    fireEvent.click(legend.closest('button')!)
    expect(screen.getByText('Sett, Brawler')).toBeTruthy()
    fireEvent.click(screen.getByText(t.communityLists.import))
    expect(onImport).toHaveBeenCalledWith('MainDeck:\n3 ven-sp1-006 Sett, Brawler\n\nRunes:\n3 Fury Rune', 'Kennen, Heart of the Tempest – flolcsc #1')
  })

  it('reads the published file first, and keeps it for when it is offline', async () => {
    published({ updatedAt: new Date().toISOString(), lists: [list({ id: 'a' })] })
    open()
    await screen.findByText(new RegExp(`^${t.communityLists.own(0, 4)}`))
    expect(api.fetchCommunityPage).not.toHaveBeenCalled()
    cleanup()

    resetCommunityLists()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    api.fetchCommunityPage.mockRejectedValueOnce(new Error('offline'))
    open()
    expect(await screen.findByText(/^Offline: showing the lists from/)).toBeTruthy()
    expect(screen.getByText('Kennen, Heart of the Tempest')).toBeTruthy()
  })

  it('sorts by how much of each list you own', async () => {
    published({
      updatedAt: new Date().toISOString(),
      lists: [list({ id: 'a', rank: 1, player: 'first' }), list({ id: 'b', rank: 2, player: 'second', deckCode: CODE })],
    })
    useAppStore.setState({ collection: { [sett.id]: 3 } })
    open()
    await screen.findByText(t.communityLists.by('first'))
    fireEvent.change(screen.getByLabelText(t.communityLists.sortLabel), { target: { value: 'owned' } })
    const players = [...document.querySelectorAll('.community-player')].map((e) => e.textContent)
    expect(players[0]).toContain('second')
    expect(screen.getAllByText(t.communityLists.ownAll).length).toBe(1)
  })

  it('shows each Legend in the Meta tab, your record against it, and the cards its lists play', async () => {
    published({ updatedAt: new Date().toISOString(), lists: [list({ id: 'a' })] })
    const mine = { id: 'm', gameId: 'riftbound', name: 'Mine', formatId: 'constructed', zones: {}, freeTextZones: {}, createdAt: '', updatedAt: '' }
    const result = (opponent: string, outcome: 'W' | 'L') => ({ event: 'x', date: '', game: '', format: '', store: '', placement: '', record: '', inProgress: false, matches: [{ opponent, outcome, wentFirst: '' as const }], deckVersion: null })
    useAppStore.setState({ decks: [mine], pairingsRecords: { m: [result('kennen', 'L'), result('Kennen OC', 'L'), result('Jinx', 'W')] } } as never)
    open()
    fireEvent.click(await screen.findByText(t.communityLists.tabMeta))
    expect(screen.getByText(t.communityLists.youVs(0, 2, 0))).toBeTruthy()
    fireEvent.click(screen.getByText('Kennen, Heart of the Tempest').closest('button')!)
    expect(screen.getByText('Sett, Brawler')).toBeTruthy()
    expect(screen.getByText(t.communityLists.playedIn(1, 1))).toBeTruthy()
    expect(screen.getByText(t.communityLists.startFromCore)).toBeTruthy()
  })

  it('watches a list until it costs the target or less to finish', async () => {
    published({ updatedAt: new Date().toISOString(), lists: [list({ id: 'a' })] })
    open()
    fireEvent.click((await screen.findByText('Kennen, Heart of the Tempest')).closest('button')!)
    fireEvent.click(screen.getByText(t.communityLists.watch))
    fireEvent.change(screen.getByLabelText(t.communityLists.watchLabel('USD')), { target: { value: '10' } })
    fireEvent.click(screen.getByText(t.communityLists.watchSave))
    expect(useAppStore.getState().settings.listWatches?.a).toMatchObject({ deckCode: KENNEN_CODE, target: 10 })
    expect(api.settings.set).toHaveBeenCalledWith({ listWatches: { a: expect.objectContaining({ target: 10 }) } })
  })
})
