import { describe, expect, it } from 'vitest'
import { deckListHash, summarizeDeck, withListHash, withSummary } from './deckSummary'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

describe('summarizeDeck', () => {
  const legend = makeCard('riftbound', { name: 'Jinx, Loose Cannon', category: 'Legend', colors: ['Fury', 'Chaos'] })
  const unit = makeCard('riftbound', { name: 'Unit', colors: ['Fury'] })
  const rift = { ...makeDeck('riftbound', { legend: [[legend, 1]], main: [[unit, 3]] }), formatId: 'constructed' }

  it('names the identity card, takes its colors and counts every card', () => {
    expect(summarizeDeck(rift, catalogOf([legend, unit]), 'Constructed')).toEqual({
      leader: 'Jinx, Loose Cannon',
      colors: ['Fury', 'Chaos'],
      cardCount: 4,
      formatLabel: 'Constructed',
      listHash: deckListHash(rift),
    })
  })

  it('has no leader for a game without an identity zone', () => {
    const mon = makeCard('pokemon', { name: 'Pikachu' })
    const summary = summarizeDeck(makeDeck('pokemon', { main: [[mon, 4]] }), catalogOf([mon]), 'Standard')
    expect(summary).toMatchObject({ leader: null, colors: [], cardCount: 4, formatLabel: 'Standard' })
  })

  it('joins two commanders and uses color identity for Magic', () => {
    const a = makeCard('mtg', { name: 'Tymna', colors: ['W'], colorIdentity: ['W', 'B'] })
    const b = makeCard('mtg', { name: 'Thrasios', colors: ['G', 'U'] })
    const deck = { ...makeDeck('mtg', { commander: [[a, 1], [b, 1]] }), formatId: 'commander' }
    expect(summarizeDeck(deck, catalogOf([a, b]), 'Commander')).toMatchObject({ leader: 'Tymna / Thrasios', colors: ['W', 'B', 'G', 'U'] })
  })

  it('gives up rather than guess when a card is not in the catalog', () => {
    expect(summarizeDeck(rift, catalogOf([unit]), 'Constructed')).toBeNull()
    expect(summarizeDeck(rift, new Map(), 'Constructed')).toBeNull()
  })

  it('withSummary keeps an older summary when a new one cannot be worked out, with a current list fingerprint', () => {
    const old = { leader: 'Old', colors: [], cardCount: 1, formatLabel: null, listHash: deckListHash(rift) }
    expect(withSummary({ ...rift, summary: old }, new Map(), 'Constructed').summary).toBe(old)
    const stale = { ...old, listHash: 'stale' }
    expect(withSummary({ ...rift, summary: stale }, new Map(), 'Constructed').summary).toEqual({ ...old, listHash: deckListHash(rift) })
    expect(withSummary(rift, catalogOf([legend, unit]), 'Constructed').summary?.leader).toBe('Jinx, Loose Cannon')
  })

  it('deckListHash follows the card list: order does not matter, a card or quantity change does', () => {
    const base = deckListHash(rift)
    expect(base).toMatch(/^[0-9a-f]{16}$/)
    const reordered = { ...rift, zones: { main: rift.zones.main, legend: rift.zones.legend } }
    expect(deckListHash(reordered)).toBe(base)
    expect(deckListHash({ ...rift, zones: { ...rift.zones, main: [{ ...rift.zones.main[0], quantity: 2 }] } })).not.toBe(base)
    expect(deckListHash({ ...rift, zones: { ...rift.zones, side: [{ cardId: 'x', quantity: 1 }] } })).not.toBe(base)
    expect(deckListHash({ ...rift, zones: { ...rift.zones, side: [{ cardId: 'x', quantity: 0 }] } })).toBe(base)
    expect(deckListHash({ ...rift, name: 'Renamed', formatId: 'other' })).toBe(base)
  })
  it('withListHash updates only the fingerprint, and leaves a deck without a summary alone', () => {
    const d = { ...rift, summary: { leader: 'L', colors: [], cardCount: 4, formatLabel: 'X', listHash: 'old' } }
    expect(withListHash(d).summary).toEqual({ ...d.summary, listHash: deckListHash(rift) })
    expect(withListHash(rift)).toBe(rift)
  })
})
