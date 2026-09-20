import { describe, expect, it } from 'vitest'
import { expandZone, shuffled } from './sampleHand'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

describe('sample hand helpers', () => {
  it('expands quantities into one slot per copy', () => {
    const a = makeCard('pokemon', { name: 'A' })
    const b = makeCard('pokemon', { name: 'B' })
    const deck = makeDeck('pokemon', { main: [[a, 3], [b, 1]] })
    expect(expandZone(deck, 'main', catalogOf([a, b])).map((c) => c.name)).toEqual(['A', 'A', 'A', 'B'])
    expect(expandZone(deck, 'missing', catalogOf([a, b]))).toEqual([])
  })

  it('shuffles without losing or duplicating items, and does not mutate the input', () => {
    const input = Array.from({ length: 40 }, (_, i) => i)
    const copy = [...input]
    const result = shuffled(input)
    expect(input).toEqual(copy)
    expect([...result].sort((x, y) => x - y)).toEqual(copy)
    expect(result).not.toEqual(copy)
  })

  it('is deterministic for a fixed random source', () => {
    const fixed = () => 0
    expect(shuffled([1, 2, 3, 4], fixed)).toEqual([2, 3, 4, 1])
  })
})
