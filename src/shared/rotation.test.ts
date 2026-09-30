import { describe, expect, it } from 'vitest'
import { deckRotation, hasFutureLegality, isRotating } from './rotation'
import { makeCard, makeDeck } from './testFixtures'
import type { Format } from './types'

const format = (extra: Partial<Format>): Format => ({ id: 'standard', label: 'Standard', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [], ...extra })

describe('rotation', () => {
  it("uses Scryfall's upcoming Standard for Magic", () => {
    const staying = makeCard('mtg', { name: 'Stays', legality: { standard: 'legal', future: 'legal' } })
    const leaving = makeCard('mtg', { name: 'Leaves', legality: { standard: 'legal' } })
    expect(isRotating(leaving, format({}), true)).toBe(true)
    expect(isRotating(staying, format({}), true)).toBe(false)
    // Data from before "future" was kept can't tell: nothing is flagged.
    expect(isRotating(leaving, format({}), false)).toBe(false)
    expect(isRotating(leaving, format({ id: 'modern' }), true)).toBe(false)
    expect(hasFutureLegality([leaving])).toBe(false)
    expect(hasFutureLegality([leaving, staying])).toBe(true)
  })

  it('uses the sets marked as leaving for games kept by hand', () => {
    const old = makeCard('onepiece', { name: 'Old', setId: 'OP05' })
    const fresh = makeCard('onepiece', { name: 'Fresh', setId: 'OP12' })
    const f = format({ legalSetIds: ['OP05', 'OP12'], nextRotation: { date: '2027-04-01', leavingSetIds: ['OP05'] } })
    const deck = makeDeck('onepiece', { main: [[old, 4], [fresh, 2]] })
    const byId = new Map([old, fresh].map((c) => [c.id, c]))
    expect(deckRotation(deck, f, byId, false)).toEqual({ date: '2027-04-01', cards: [{ card: old, quantity: 4 }], copies: 4 })
    expect(deckRotation(deck, format({ legalSetIds: ['OP05', 'OP12'] }), byId, false)).toBeNull()
  })
})
