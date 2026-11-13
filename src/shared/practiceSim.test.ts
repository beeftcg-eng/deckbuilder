import { describe, expect, it } from 'vitest'
import { simulateDeck } from './practiceSim'
import { makeCard } from './testFixtures'

/** A tiny seeded random, so the numbers are the same every run. */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const copies = (card: ReturnType<typeof makeCard>, n: number) => Array.from({ length: n }, () => card)

describe('simulated games', () => {
  it('plays a One Piece curve from DON!!: 1-costs always have a play on turn 1', () => {
    const one = makeCard('onepiece', { name: 'One', category: 'Character', cost: '1' })
    const result = simulateDeck('onepiece', copies(one, 50), { handSize: 5, onThePlay: true, games: 200, random: seeded(1) })!
    expect(result.turns[0].hadPlay).toBe(1)
    expect(result.turns[0].used).toBe(1)
    expect(result.slowStart).toBe(0)
    expect(result.cards[0]).toMatchObject({ copies: 50, played: 1, averageTurn: 1 })
  })

  it('a deck of 5-costs starts slow and wastes its early DON!!', () => {
    const five = makeCard('onepiece', { name: 'Five', category: 'Character', cost: '5' })
    const result = simulateDeck('onepiece', copies(five, 50), { handSize: 5, onThePlay: true, games: 100, random: seeded(2) })!
    expect(result.slowStart).toBe(1)
    expect(result.turns[0].used).toBe(0)
    expect(result.turns[2].hadPlay).toBe(1) // turn 3: 5 DON!!
  })

  it('counts missed land drops in Magic', () => {
    const land = makeCard('mtg', { name: 'Forest', category: 'Land' })
    const bear = makeCard('mtg', { name: 'Bear', category: 'Creature', cost: '2' })
    const noLands = simulateDeck('mtg', copies(bear, 60), { handSize: 7, onThePlay: true, games: 50, random: seeded(3) })!
    expect(noLands.turns[0].missedResource).toBe(1)
    const mixed = simulateDeck('mtg', [...copies(land, 24), ...copies(bear, 36)], { handSize: 7, onThePlay: true, games: 500, random: seeded(4) })!
    expect(mixed.turns[1].hadPlay).toBeGreaterThan(0.7)
    expect(mixed.cards.map((c) => c.card.name)).toEqual(['Bear'])
  })

  it('has nothing to simulate for Yu-Gi-Oh!', () => {
    expect(simulateDeck('yugioh', [makeCard('yugioh', { name: 'X' })], { handSize: 5, onThePlay: true })).toBeNull()
  })
})
