import { describe, expect, it } from 'vitest'
import { carryOverPrices } from './carryOverPrices'
import { makeCard } from './testFixtures'

const card = (sourceId: string, price: number | null) => makeCard('pokemon', { name: sourceId, sourceId, price })

describe('carryOverPrices', () => {
  it('fills a missing price from the previous sync, and leaves fresh prices alone', () => {
    const result = carryOverPrices([card('a', null), card('b', 2.5), card('c', null)], [card('a', 1.25), card('b', 9), card('z', 4)])
    expect(result.map((c) => c.price)).toEqual([1.25, 2.5, null])
  })
  it('returns the same array when nothing was known before', () => {
    const fresh = [card('a', null)]
    expect(carryOverPrices(fresh, [card('a', null)])).toBe(fresh)
    expect(carryOverPrices(fresh, [])).toBe(fresh)
  })
})
