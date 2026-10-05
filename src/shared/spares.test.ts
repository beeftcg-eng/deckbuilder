import { describe, expect, it } from 'vitest'
import { spareCopies } from './spares'
import { makeCard } from './testFixtures'

describe('spareCopies', () => {
  it("counts a Riftbound card's printings together against its limit of 3", () => {
    const regular = makeCard('riftbound', { name: 'Ahri - Alluring', price: 1 })
    const altArt = makeCard('riftbound', { name: 'Ahri - Alluring (Alternate Art)', price: 10 })
    const other = makeCard('riftbound', { name: 'Blazing Scorcher', price: 0.5 })
    const [ahri, ...rest] = spareCopies([
      { card: regular, copies: 3 },
      { card: altArt, copies: 2 },
      { card: other, copies: 3 },
    ])
    expect(rest).toEqual([])
    expect(ahri).toMatchObject({ name: 'Ahri, Alluring', owned: 5, limit: 3, spare: 2, spareValue: 2 })
    expect(ahri.printings.map((p) => p.card.id)).toEqual([altArt.id, regular.id])
  })

  it('uses the zone limit (one Legend) and skips cards without a copy limit', () => {
    const legend = makeCard('riftbound', { name: 'Jinx - Loose Cannon', category: 'Legend', price: 2 })
    const rune = makeCard('riftbound', { name: 'Fury Rune', category: 'Rune' })
    const energy = makeCard('pokemon', { name: 'Fire Energy', category: 'Energy', subtypes: ['Basic'] })
    const spares = spareCopies([
      { card: legend, copies: 2 },
      { card: rune, copies: 20 },
      { card: energy, copies: 40 },
    ])
    expect(spares.map((s) => [s.name, s.spare])).toEqual([['Jinx, Loose Cannon', 1]])
  })

  it('counts Magic printings by name, four to a deck', () => {
    const a = makeCard('mtg', { name: 'Lightning Bolt', setId: 'm10', price: 2 })
    const b = makeCard('mtg', { name: 'Lightning Bolt', setId: '2xm', price: 1 })
    expect(spareCopies([{ card: a, copies: 3 }, { card: b, copies: 3 }])).toMatchObject([{ owned: 6, limit: 4, spare: 2, spareValue: 2 }])
  })
})
