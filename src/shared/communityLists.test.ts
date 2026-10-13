import { describe, expect, it } from 'vitest'
import { fromRiftAtlas } from './communityLists'

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

  it('finds nothing on a page without the data', () => {
    expect(fromRiftAtlas('<html></html>')).toEqual([])
  })
})
