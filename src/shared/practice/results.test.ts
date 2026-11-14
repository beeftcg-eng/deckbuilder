import { describe, expect, it } from 'vitest'
import { recordsFor, sanitizePracticeResults, type PracticeResult } from './results'
import { packState, unpackState } from './serialize'
import { applyTool, mulligan, newGame } from './riftbound'
import { makeCard } from '../testFixtures'

const result = (over: Partial<PracticeResult>): PracticeResult => ({ at: '2026-11-13T00:00:00Z', deckId: 'd1', opponentId: 'VEN-155', opponentName: 'Kennen', won: true, points: [8, 3], level: 'normal', byHand: true, ...over })

describe('practice results', () => {
  it("adds up a deck's record against each opponent", () => {
    const records = recordsFor([result({}), result({ won: false }), result({ opponentId: 'deck:x', opponentName: 'Mine' }), result({ deckId: 'other' })], 'd1')
    expect(records).toEqual([
      { opponentId: 'VEN-155', opponentName: 'Kennen', wins: 1, losses: 1 },
      { opponentId: 'deck:x', opponentName: 'Mine', wins: 1, losses: 0 },
    ])
    expect(sanitizePracticeResults([result({}), { nope: 1 }])).toHaveLength(1)
  })
})

describe('saving a game', () => {
  it('packs cards as ids, keeps tokens whole, and unpacks against the card data', () => {
    const cards = Array.from({ length: 12 }, (_, i) => makeCard('riftbound', { name: `U${i}`, category: 'Unit', cost: '1', might: 2 }))
    const deck = { main: [...cards, ...cards, ...cards], champion: null, legend: null, battlefields: [makeCard('riftbound', { name: 'A', category: 'Battlefield' })], runes: Array.from({ length: 12 }, () => 'Fury') }
    let s = newGame(deck, null, { random: () => 0.3 })
    s = mulligan(s, 0, [])
    s = applyTool(s, { kind: 'token', side: 0, name: 'Sprite', might: 3, battlefield: null, ready: true })
    const packed = packState(s)
    expect(packed.length).toBeLessThan(JSON.stringify(s).length / 2)
    const byId = new Map([...cards, ...deck.battlefields].map((c) => [c.id, c]))
    const back = unpackState(packed, byId)!
    expect(back.players[0].hand.map((c) => c.id)).toEqual(s.players[0].hand.map((c) => c.id))
    expect(back.players[0].base[0].card.name).toBe('Sprite token')
    // A card missing from the card data: can't be resumed.
    expect(unpackState(packed, new Map())).toBeNull()
  })
})
