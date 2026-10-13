import { describe, expect, it } from 'vitest'
import { collectCommunityLists, fromRiftAtlas, readCommunityListsFile, readEventPage } from './communityLists'
import { t } from './i18n'

/** RiftAtlas's Decks page the way Next.js streams it, split over push() chunks. */
function page(data: object): string {
  const json = JSON.stringify(data)
  const half = Math.floor(json.length / 2)
  return [json.slice(0, half), json.slice(half)].map((part) => `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`).join('')
}

const finish = (over: object) => ({ eventId: 'e1', eventName: 'Challenger #5', startDate: '2026-10-11T16:00:00.000Z', players: 46, rank: 1, player: 'a', legendId: 'VEN-155', hasDeck: true, deckCode: 'CODE1', ...over })

describe('RiftAtlas community lists', () => {
  it('reads the finishes that have a deck, newest first and by placing', () => {
    const html = page({
      labels: { 'VEN-155': { name: 'Kennen, Heart of the Tempest' } },
      details: {
        kennen: { finishes: [finish({}), finish({ rank: 3, player: 'b', deckCode: 'CODE2' }), finish({ hasDeck: false, deckCode: undefined })], coreCards: [] },
        ziggs: { finishes: [finish({ eventId: 'e0', startDate: '2026-10-01T00:00:00.000Z', legendId: 'RAD-141', deckCode: 'CODE3' }), finish({})], coreCards: [] },
      },
    })
    const lists = fromRiftAtlas(html)
    expect(lists.map((l) => [l.deckCode, l.rank, l.legendName])).toEqual([
      ['CODE1', 1, 'Kennen, Heart of the Tempest'],
      ['CODE2', 3, 'Kennen, Heart of the Tempest'],
      ['CODE3', 1, 'RAD-141'],
    ])
    expect(lists[0]).toMatchObject({ eventName: 'Challenger #5', players: 46, player: 'a', date: '2026-10-11T16:00:00.000Z' })
  })

  it('says so when the page no longer has the data', () => {
    expect(() => fromRiftAtlas('<html></html>')).toThrow(t.communityLists.layoutChanged)
    expect(fromRiftAtlas(page({ labels: {}, details: {} }))).toEqual([])
  })

  /** 1 Kennen (VEN-155) and 3 Sett, Brawler. */
  const KENNEN = 'CUAQEAYBAECQAAQBAEAQCBIAACNQCAAA'
  const event = { id: 'challenger-5', name: 'Challenger #5', date: '2026-10-11T16:00:00.000Z', players: 46 }
  const labels = { 'VEN-155': 'Kennen, Heart of the Tempest' }
  const eventPage = page({
    top: [
      { href: `/decks/view?code=${KENNEN}&name=flolcsc+%C2%B7+Challenger+%235&event=challenger-5&rank=1` },
      { href: `/decks/view?code=${KENNEN}&name=other&event=another-event&rank=2` },
    ],
    rows: [
      { rank: 33, player: 'late', record: '1-3', legendId: null, deckCode: null },
      { rank: 34, player: 'sholmes', record: '1-2', legendId: 'VEN-155', deckCode: 'ABCDEFGH' },
    ],
  })

  it("reads an event's page: its linked decks and its standings rows", () => {
    const lists = readEventPage(eventPage, event, labels)
    expect(lists.map((l) => [l.rank, l.player, l.legendId, l.legendName, l.eventName, l.players])).toEqual([
      [1, 'flolcsc', 'VEN-155', 'Kennen, Heart of the Tempest', 'Challenger #5', 46],
      [34, 'sholmes', 'VEN-155', 'Kennen, Heart of the Tempest', 'Challenger #5', 46],
    ])
  })

  it('collects the Decks page and its events, the same finish once', async () => {
    const decksPage = page({
      labels: { 'VEN-155': { name: 'Kennen, Heart of the Tempest' } },
      details: { kennen: { finishes: [{ eventId: 'challenger-5', eventName: 'Challenger #5', startDate: event.date, players: 46, rank: 1, player: 'flolcsc', legendId: 'VEN-155', hasDeck: true, deckCode: KENNEN }] } },
    })
    const fetched: string[] = []
    const file = await collectCommunityLists(async (url) => {
      fetched.push(url)
      return url.endsWith('/decks') ? decksPage : eventPage
    })
    expect(fetched).toEqual(['https://riftatlas.com/decks', 'https://riftatlas.com/events/challenger-5'])
    expect(file.lists.map((l) => [l.rank, l.player])).toEqual([
      [1, 'flolcsc'],
      [34, 'sholmes'],
    ])
    expect(readCommunityListsFile(JSON.parse(JSON.stringify(file)))).toEqual(file)
    expect(readCommunityListsFile({ updatedAt: 'x', lists: [{ id: 1 }] })).toBeNull()
  })
})
