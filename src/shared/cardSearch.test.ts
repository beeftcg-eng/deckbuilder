import { describe, expect, it } from 'vitest'
import { matchRank } from './cardSearch'
import { makeCard } from './testFixtures'

const ygo = (name: string, subtypes: string[] = []) => makeCard('yugioh', { name, subtypes })

describe('matchRank', () => {
  it('puts an exact name match first', () => {
    const exact = ygo('Blue-Eyes White Dragon', ['Dragon', 'Normal'])
    const prefix = ygo('Blue-Eyes Ultimate Dragon', ['Dragon', 'Effect', 'Fusion', 'Extra Deck'])
    expect(matchRank(exact, 'blue-eyes white dragon')).toBeLessThan(matchRank(prefix, 'blue-eyes white dragon'))
  })

  it('puts a vanilla Normal Monster ahead of other cards that start with the same query', () => {
    const original = ygo('Blue-Eyes White Dragon', ['Dragon', 'Normal'])
    const spinoff = ygo('Blue-Eyes Ultimate Dragon', ['Dragon', 'Effect', 'Fusion', 'Extra Deck'])
    const another = ygo('Blue-Eyes Twin Burst Dragon', ['Dragon', 'Effect', 'Synchro', 'Extra Deck'])
    expect(matchRank(original, 'blue-eyes')).toBeLessThan(matchRank(spinoff, 'blue-eyes'))
    expect(matchRank(original, 'blue-eyes')).toBeLessThan(matchRank(another, 'blue-eyes'))
  })

  it('ranks any other prefix match ahead of a match found elsewhere in the name', () => {
    const prefix = ygo('Blue-Eyes Jet Dragon', ['Dragon', 'Effect'])
    const midword = ygo('The Melody of Awakening Blue-Eyes Dragon', ['Spell'])
    expect(matchRank(prefix, 'blue-eyes')).toBeLessThan(matchRank(midword, 'blue-eyes'))
  })

  it('does not affect games whose subtypes never carry "Normal"', () => {
    const a = makeCard('mtg', { name: 'Cyclonic Rift', subtypes: [] })
    const b = makeCard('mtg', { name: 'Cyclonic Something Else', subtypes: [] })
    expect(matchRank(a, 'cyclonic')).toBe(matchRank(b, 'cyclonic')) // both tie at the same "prefix, non-vanilla" rank
  })
})
