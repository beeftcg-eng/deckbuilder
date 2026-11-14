import { describe, expect, it } from 'vitest'
import { matchWinner, newMatch, openBattlefields, swap, swapCounts, swapped, withBattlefields, withResult } from './riftboundMatch'

const deck = {
  zones: { main: [{ cardId: 'a', quantity: 3 }, { cardId: 'b', quantity: 2 }], sideboard: [{ cardId: 'x', quantity: 2 }], legend: [{ cardId: 'L', quantity: 1 }] },
  freeTextZones: {},
}

describe('a best-of-3 match', () => {
  it('is won at two games', () => {
    let m = newMatch(null)
    m = withResult(m, 0)
    expect(matchWinner(m)).toBeNull()
    m = withResult(withResult(m, 1), 1)
    expect(m.wins).toEqual([1, 2])
    expect(matchWinner(m)).toBe(1)
  })

  it('swaps one for one, and swapping back undoes it', () => {
    let s = swap(deck, { out: {}, in: {} }, 'a', 'out')!
    s = swap(deck, s, 'x', 'in')!
    expect(swapCounts(s)).toEqual({ out: 1, in: 1 })
    const d = swapped(deck, s)
    expect(d.zones.main).toEqual([{ cardId: 'a', quantity: 2 }, { cardId: 'b', quantity: 2 }, { cardId: 'x', quantity: 1 }])
    expect(d.zones.sideboard).toEqual([{ cardId: 'x', quantity: 1 }, { cardId: 'a', quantity: 1 }])
    expect(d.zones.legend).toEqual(deck.zones.legend)
    s = swap(deck, s, 'x', 'out')!
    expect(s).toEqual({ out: { a: 1 }, in: {} })
    expect(swap(deck, { out: {}, in: {} }, 'zz', 'in')).toBeNull()
  })

  it("won't offer a battlefield already played, unless every one has been", () => {
    const bfs = [{ id: 'p' }, { id: 'q' }]
    let m = withBattlefields(newMatch(null), 'p', 'r')
    expect(openBattlefields(bfs, m, 0)).toEqual([{ id: 'q' }])
    m = withBattlefields(m, 'q', null)
    expect(openBattlefields(bfs, m, 0)).toEqual(bfs)
  })
})
