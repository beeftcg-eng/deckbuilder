import { describe, expect, it } from 'vitest'
import { currentDeckFor } from './decks'
import { makeDeck } from './testFixtures'

const rift = { ...makeDeck('riftbound', {}), id: 'r1' }
const mtg = { ...makeDeck('mtg', {}), id: 'm1' }

describe('currentDeckFor', () => {
  it('returns the selected deck when it belongs to the game being browsed', () => {
    expect(currentDeckFor([rift, mtg], 'r1', 'riftbound')).toBe(rift)
    expect(currentDeckFor([rift, mtg], 'm1', 'mtg')).toBe(mtg)
  })
  it('returns nothing when the selected deck is another game’s (the bug: it filtered Magic to zero cards)', () => {
    expect(currentDeckFor([rift, mtg], 'r1', 'mtg')).toBeUndefined()
    expect(currentDeckFor([rift, mtg], 'm1', 'pokemon')).toBeUndefined()
  })
  it('returns nothing for no selection or an unknown id', () => {
    expect(currentDeckFor([rift], null, 'riftbound')).toBeUndefined()
    expect(currentDeckFor([rift], 'ghost', 'riftbound')).toBeUndefined()
  })
})
