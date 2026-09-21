import { describe, expect, it } from 'vitest'
import { cardsInSet, summarizeSets, topUpItems, unownedUnwishlisted } from './setProgress'
import { makeCard } from './testFixtures'

const card = (name: string, setId: string, setName: string) => makeCard('pokemon', { name, setId, setName, setCode: setId.toUpperCase() })
const a1 = card('A1', 'sv1', 'Scarlet & Violet')
const a2 = card('A2', 'sv1', 'Scarlet & Violet')
const a3 = card('A3', 'sv1', 'Scarlet & Violet')
const b1 = card('B1', 'pal', 'Paldea Evolved')
const cards = [a1, a2, a3, b1]

describe('summarizeSets', () => {
  it('counts each set’s cards and how many you own, sorted by set name', () => {
    const summaries = summarizeSets(cards, { [a1.id]: 3, [a2.id]: 1 })
    expect(summaries.map((s) => s.setName)).toEqual(['Paldea Evolved', 'Scarlet & Violet'])
    expect(summaries[1]).toMatchObject({ setId: 'sv1', total: 3, owned: 2, copies: 4, setCode: 'SV1' })
    expect(summaries[0]).toMatchObject({ total: 1, owned: 0, copies: 0 })
  })
  it('ignores zero-copy entries and cards from other games', () => {
    const s = summarizeSets(cards, { [a1.id]: 0, 'onepiece:OP01-001': 4 })
    expect(s.find((x) => x.setId === 'sv1')).toMatchObject({ owned: 0, copies: 0 })
  })
  it('is empty for no cards', () => {
    expect(summarizeSets([], {})).toEqual([])
  })
})

describe('cardsInSet', () => {
  it('returns just that set', () => {
    expect(cardsInSet(cards, 'sv1')).toEqual([a1, a2, a3])
    expect(cardsInSet(cards, 'nope')).toEqual([])
  })
})

describe('topUpItems', () => {
  it('adds only what is missing to own N of each', () => {
    const items = topUpItems([a1, a2, a3], { [a1.id]: 1, [a2.id]: 4 }, 3)
    expect(items).toEqual([{ cardId: a1.id, quantity: 2 }, { cardId: a3.id, quantity: 3 }]) // a2 already has 4 >= 3
  })
  it('is idempotent: applying its result leaves nothing to add', () => {
    const collection = { [a1.id]: 1 }
    for (const { cardId, quantity } of topUpItems(cards, collection, 2)) collection[cardId] = (collection[cardId] ?? 0) + quantity
    expect(topUpItems(cards, collection, 2)).toEqual([])
  })
})

describe('unownedUnwishlisted', () => {
  it('leaves out owned and already-wishlisted cards', () => {
    expect(unownedUnwishlisted(cards, { [a1.id]: 1 }, new Set([a2.id]))).toEqual([a3, b1])
  })
})
