import { describe, expect, it } from 'vitest'
import { buildTradeCollection, buildTradeWants } from './trade'
import { makeCard, catalogOf } from './testFixtures'
import type { WishlistEntry } from './types'

describe('buildTradeCollection', () => {
  it('resolves owned cards against the loaded catalog and carries the for-trade flag', () => {
    const bolt = makeCard('mtg', { name: 'Lightning Bolt', sourceId: 'bolt' })
    const catalog = catalogOf([bolt])
    const { entries, skipped } = buildTradeCollection({ [bolt.id]: 3 }, new Set([bolt.id]), () => catalog)
    expect(skipped).toBe(0)
    expect(entries).toEqual([{ gameId: 'mtg', cardId: bolt.id, cardName: 'Lightning Bolt', setCode: 'SET', quantity: 3, forTrade: true }])
  })

  it('leaves the for-trade flag off for cards not in the for-trade set', () => {
    const bolt = makeCard('mtg', { name: 'Lightning Bolt', sourceId: 'bolt' })
    const { entries } = buildTradeCollection({ [bolt.id]: 1 }, new Set(), () => catalogOf([bolt]))
    expect(entries[0].forTrade).toBe(false)
  })

  it('skips a card whose game catalog is not loaded and zero/negative quantities', () => {
    const bolt = makeCard('mtg', { name: 'Lightning Bolt', sourceId: 'bolt' })
    const { entries, skipped } = buildTradeCollection({ [bolt.id]: 1, 'mtg:unknown': 2, 'mtg:zero': 0 }, new Set(), () => catalogOf([bolt]))
    expect(entries).toHaveLength(1)
    expect(skipped).toBe(1) // only the unresolvable one counts; the zero-quantity entry is just skipped silently
  })
})

describe('buildTradeWants', () => {
  it('resolves wishlist entries against the loaded catalog', () => {
    const bolt = makeCard('mtg', { name: 'Lightning Bolt', sourceId: 'bolt' })
    const wishlist: WishlistEntry[] = [{ id: 'w1', gameId: 'mtg', cardId: bolt.id, quantity: 2, addedAt: '2026-01-01', pushedTaskId: null }]
    const { entries, skipped } = buildTradeWants(wishlist, () => catalogOf([bolt]))
    expect(skipped).toBe(0)
    expect(entries).toEqual([{ gameId: 'mtg', cardId: bolt.id, cardName: 'Lightning Bolt', quantity: 2 }])
  })

  it('skips a wishlist entry whose catalog is not loaded', () => {
    const wishlist: WishlistEntry[] = [{ id: 'w1', gameId: 'mtg', cardId: 'mtg:unknown', quantity: 1, addedAt: '2026-01-01', pushedTaskId: null }]
    const { entries, skipped } = buildTradeWants(wishlist, () => undefined)
    expect(entries).toHaveLength(0)
    expect(skipped).toBe(1)
  })
})
