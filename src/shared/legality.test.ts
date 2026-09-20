import { describe, expect, it } from 'vitest'
import { checkDeckLegality } from './legality'
import { onepieceAdapter } from './games/onepiece'
import { pokemonAdapter } from './games/pokemon'
import { catalogOf, makeCard, makeDeck } from './testFixtures'
import type { Format } from './types'

const noBans: Format = { id: 'standard', label: 'Standard', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] }

describe('checkDeckLegality copy limits', () => {
  it('pools Pokémon copies across printings by name', () => {
    const a = makeCard('pokemon', { name: 'Pikachu', sourceId: 'a', legality: { standard: 'legal' } })
    const b = makeCard('pokemon', { name: 'Pikachu', sourceId: 'b', legality: { standard: 'legal' } })
    const deck = makeDeck('pokemon', { main: [[a, 3], [b, 2]] })
    const result = checkDeckLegality(deck, pokemonAdapter, noBans, catalogOf([a, b]))
    expect(result.issues.some((i) => i.message.includes('Pikachu: 5 copies exceeds the 4-copy limit'))).toBe(true)
  })

  it('gives One Piece cards with different numbers their own 4 copies', () => {
    const a = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'OP08-066', colors: ['Red'] })
    const b = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'ST34-003', colors: ['Red'] })
    const leader = makeCard('onepiece', { name: 'Leader', sourceId: 'OP01-001', category: 'Leader', colors: ['Red'] })
    const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[a, 4], [b, 4]] })
    const result = checkDeckLegality(deck, onepieceAdapter, noBans, catalogOf([a, b, leader]))
    expect(result.issues.some((i) => i.message.includes('copies exceeds'))).toBe(false)
  })

  it('flags a banned card even when a different printing of it is in the deck', () => {
    const banned = makeCard('onepiece', { name: 'Banned', sourceId: 'OP06-116', id: 'onepiece:OP06-116_p2', colors: ['Red'] })
    const leader = makeCard('onepiece', { name: 'Leader', sourceId: 'OP01-001', category: 'Leader', colors: ['Red'] })
    const format: Format = { ...noBans, bannedCardIds: ['onepiece:OP06-116'] }
    const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[banned, 1]] })
    const result = checkDeckLegality(deck, onepieceAdapter, format, catalogOf([banned, leader]))
    expect(result.issues.some((i) => i.message.includes('Banned is banned'))).toBe(true)
  })
})
