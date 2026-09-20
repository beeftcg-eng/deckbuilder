import { describe, expect, it } from 'vitest'
import { withQuantity } from './deckEdits'

interface Entry {
  cardId: string
  quantity: number
}
const entries: Entry[] = [
  { cardId: 'a', quantity: 1 },
  { cardId: 'b', quantity: 2 },
  { cardId: 'c', quantity: 3 },
]
const is = (id: string) => (e: Entry) => e.cardId === id
const make = (id: string) => () => ({ cardId: id, quantity: 0 })

describe('withQuantity', () => {
  it('changes an existing entry without moving it', () => {
    expect(withQuantity(entries, is('a'), make('a'), 4)).toEqual([
      { cardId: 'a', quantity: 4 },
      { cardId: 'b', quantity: 2 },
      { cardId: 'c', quantity: 3 },
    ])
  })

  it('appends an entry that is not there yet', () => {
    expect(withQuantity(entries, is('d'), make('d'), 2).map((e) => [e.cardId, e.quantity])).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 2]])
  })

  it('removes an entry at quantity 0 (or below) and leaves the others in order', () => {
    expect(withQuantity(entries, is('b'), make('b'), 0).map((e) => e.cardId)).toEqual(['a', 'c'])
    expect(withQuantity(entries, is('b'), make('b'), -1).map((e) => e.cardId)).toEqual(['a', 'c'])
  })

  it('does not mutate its input', () => {
    const copy = structuredClone(entries)
    withQuantity(entries, is('a'), make('a'), 9)
    expect(entries).toEqual(copy)
  })
})
