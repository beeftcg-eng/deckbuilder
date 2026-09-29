import { describe, expect, it } from 'vitest'
import { changePull, newOpening, openingValue } from './packOpenings'
import { catalogOf, makeCard } from './testFixtures'

const chase = makeCard('riftbound', { name: 'Kai’Sa - Survivor (Overnumbered)', price: 80 })
const common = makeCard('riftbound', { name: 'Bewitching Spirit', price: 0.1 })
const unpriced = makeCard('riftbound', { name: 'Promo', price: null })
const cards = catalogOf([chase, common, unpriced])

describe('pack openings', () => {
  it('starts dated today and empty', () => {
    const o = newOpening('riftbound', 'Unleashed box', 90, true, new Date(2026, 8, 29))
    expect(o).toMatchObject({ gameId: 'riftbound', name: 'Unleashed box', date: '2026-09-29', costUsd: 90, pulls: [], addToCollection: true })
  })

  it('adds, counts up and removes pulls, newest first', () => {
    let o = newOpening('riftbound', 'x', null, false)
    o = changePull(o, common.id, 1)
    o = changePull(o, chase.id, 1)
    o = changePull(o, common.id, 2)
    expect(o.pulls).toEqual([
      { cardId: chase.id, quantity: 1 },
      { cardId: common.id, quantity: 3 },
    ])
    expect(changePull(changePull(o, chase.id, -1), 'missing', -1).pulls).toEqual([{ cardId: common.id, quantity: 3 }])
  })

  it('values the pulls against the cost, with the best pull', () => {
    let o = newOpening('riftbound', 'x', 90, false)
    for (const [card, n] of [[common, 10], [chase, 1], [unpriced, 2]] as const) o = changePull(o, card.id, n)
    o = changePull(o, 'gone', 1)
    const v = openingValue(o, (id) => cards.get(id))
    expect(v.value).toBeCloseTo(81)
    expect(v).toMatchObject({ copies: 14, unpricedCopies: 2, unknown: 1, best: { card: chase, value: 80 } })
    expect(v.result).toBeCloseTo(-9)
    expect(v.resultShare).toBeCloseTo(-0.1)
    expect(openingValue({ ...o, costUsd: null }, (id) => cards.get(id)).result).toBeNull()
  })
})
