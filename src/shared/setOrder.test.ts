import { describe, expect, it } from 'vitest'
import { setReleaseDates, sortSetsByRelease } from './setOrder'
import { makeCard } from './testFixtures'

describe('set order', () => {
  it("dates a set by its own date where it has one, else by its newest card's", () => {
    const dates = setReleaseDates([
      makeCard('yugioh', { name: 'Reprint', setId: 'NEW', released: '2002-03-08', setReleased: '2026-05-01' }),
      makeCard('yugioh', { name: 'Old reprint', setId: 'OLD', released: '2002-03-08' }),
      makeCard('yugioh', { name: 'Old new card', setId: 'OLD', released: '2010-01-01' }),
      makeCard('onepiece', { name: 'Promo', setId: 'P' }),
    ])
    expect(Object.fromEntries(dates)).toEqual({ NEW: '2026-05-01', OLD: '2010-01-01' })
  })

  it('sorts newest first, with undated sets last by name', () => {
    const dates = new Map([['OP-01', '2022-12-02'], ['OP-17', '2026-08-28'], ['ST-36', '2026-07-31']])
    const sets: [string, string][] = [['P', 'Promos'], ['OP-01', 'Romance Dawn'], ['DON', 'DON!! Cards'], ['ST-36', 'Starter 36'], ['OP-17', 'Strongest']]
    expect(sortSetsByRelease(sets, dates, ([id]) => id, ([, name]) => name).map(([id]) => id)).toEqual(['OP-17', 'ST-36', 'OP-01', 'DON', 'P'])
  })
})
