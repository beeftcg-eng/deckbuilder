import { describe, expect, it } from 'vitest'
import { playCost, resourceRule, resourcesAt } from './practiceResources'
import { makeCard } from './testFixtures'

describe('Practice resources', () => {
  it("gives One Piece's DON!!: 1 going first, 2 going second, +2 a turn, at most 10", () => {
    const rule = resourceRule('onepiece')!
    expect([0, 1, 2, 3, 6].map((turn) => resourcesAt(rule, turn, true, []))).toEqual([0, 1, 3, 5, 10])
    expect(resourcesAt(rule, 1, false, [])).toBe(2)
  })

  it("gives Riftbound's runes: 2 a turn, 3 on the second player's first, at most 12", () => {
    const rule = resourceRule('riftbound')!
    expect([1, 2, 6, 7].map((turn) => resourcesAt(rule, turn, true, []))).toEqual([2, 4, 12, 12])
    expect(resourcesAt(rule, 1, false, [])).toBe(3)
  })

  it('counts the lands played for Magic, and charges mana value for the rest', () => {
    const rule = resourceRule('mtg')!
    const land = makeCard('mtg', { name: 'Forest', category: 'Land' })
    const bear = makeCard('mtg', { name: 'Bear', category: 'Creature', cost: '2' })
    expect(resourcesAt(rule, 3, true, [land, bear, land])).toBe(2)
    expect(playCost(rule, bear)).toBe(2)
    expect(playCost(rule, land)).toBeNull()
  })

  it("counts Pokémon's Energy attached, with nothing to pay", () => {
    const rule = resourceRule('pokemon')!
    const energy = makeCard('pokemon', { name: 'Fire Energy', category: 'Energy' })
    expect(resourcesAt(rule, 2, true, [energy, energy])).toBe(2)
    expect(playCost(rule, makeCard('pokemon', { name: 'Charmander', category: 'Pokémon', cost: '1' }))).toBeNull()
    expect(resourceRule('yugioh')).toBeNull()
  })
})
