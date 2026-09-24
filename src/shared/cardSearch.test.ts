import { describe, expect, it } from 'vitest'
import { matchRank, matchesPrintedCode, matchesSearch } from './cardSearch'
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

describe('matchesPrintedCode', () => {
  const lede = makeCard('yugioh', { name: 'Some Card', setCode: 'LEDE', number: 'EN067' })
  it('matches the full printed code however it is typed', () => {
    for (const q of ['LEDE-EN067', 'lede-en067', 'LEDE EN067', 'LEDEEN067', 'LEDE-EN06']) expect(matchesPrintedCode(lede, q)).toBe(true)
  })
  it('does not match another number, a too-short query, or a card with no number', () => {
    expect(matchesPrintedCode(lede, 'LEDE-EN068')).toBe(false)
    expect(matchesPrintedCode(lede, 'le')).toBe(false)
    expect(matchesPrintedCode(makeCard('yugioh', { name: 'X', setCode: 'LEDE', number: '' }), 'LEDE')).toBe(false)
  })
  it('works for other games too', () => {
    expect(matchesPrintedCode(makeCard('pokemon', { name: 'Iono', setCode: 'PAL', number: '185' }), 'PAL 185')).toBe(true)
  })
})

describe('matchesSearch', () => {
  it('finds a card by its expansion name or code, in every game', () => {
    const cards = [
      makeCard('yugioh', { name: 'Way Where There\'s a Will', setName: 'Legacy of Destruction', setCode: 'LEDE', number: 'EN067' }),
      makeCard('pokemon', { name: 'Iono', setName: 'Paldea Evolved', setCode: 'PAL', number: '185' }),
      makeCard('onepiece', { name: 'Kalifa', setName: 'Pillars of Strength', setCode: 'OP-03', number: 'OP03-081' }),
      makeCard('riftbound', { name: 'Jinx', setName: 'Origins', setCode: 'OGN', number: '202' }),
      makeCard('mtg', { name: 'Sol Ring', setName: 'Commander Masters', setCode: 'CMM', number: '410' }),
    ]
    const find = (q: string) => cards.filter((c) => matchesSearch(c, q.toLowerCase())).map((c) => c.name)
    expect(find('legacy of destruction')).toEqual(["Way Where There's a Will"])
    expect(find('Paldea')).toEqual(['Iono'])
    expect(find('pillars of strength')).toEqual(['Kalifa'])
    expect(find('origins')).toEqual(['Jinx'])
    expect(find('Commander Masters')).toEqual(['Sol Ring'])
    expect(find('CMM')).toEqual(['Sol Ring'])
    expect(find('LEDE-EN067')).toEqual(["Way Where There's a Will"])
    expect(find('nothing like this')).toEqual([])
  })
})
