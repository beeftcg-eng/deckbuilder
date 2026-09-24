import { describe, expect, it } from 'vitest'
import { applyIdRepairs, staleIdRepairs, storedCardIds, type RepairableData } from './cardIdRepair'
import { uniquifyCardIds } from './cardIds'
import { normalizeCard } from './games/yugioh'
import type { Card, Deck } from './types'

// One card with several printings, the way YGOPRODeck lists them.
function catalog(): Card[] {
  const raw = {
    id: 10045474,
    name: 'Infinite Impermanence',
    type: 'Trap Card',
    card_images: [{ id: 10045474 }],
    card_sets: [
      { set_name: 'Flames of Destruction', set_code: 'FLOD-EN077', set_rarity: 'Common' },
      { set_name: 'Duelist Pack', set_code: 'DUPO-EN021', set_rarity: 'Ultra Rare' },
      { set_name: 'Rarity Collection', set_code: 'RA01-EN074', set_rarity: 'Super Rare' },
      { set_name: 'Rarity Collection', set_code: 'RA01-EN074', set_rarity: 'Secret Rare' },
      { set_name: 'Rarity Collection', set_code: 'RA01-EN074', set_rarity: "Collector's Rare" },
    ],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return uniquifyCardIds(normalizeCard(raw as any))
}

const idOf = (cards: Card[], setId: string, rarity: string) => cards.find((c) => c.setId === setId && c.rarity === rarity)!.id

describe('staleIdRepairs', () => {
  const cards = catalog()

  it('leaves ids the catalog still has alone', () => {
    expect(staleIdRepairs(cards.map((c) => c.id), cards).size).toBe(0)
  })

  it('maps the pre-0.12 `~SET` / `~SET~n` ids to that set\'s printings in listed order', () => {
    const repairs = staleIdRepairs(['yugioh:10045474~DUPO', 'yugioh:10045474~RA01', 'yugioh:10045474~RA01~2', 'yugioh:10045474~RA01~3'], cards)
    expect(repairs.get('yugioh:10045474~DUPO')).toBe(idOf(cards, 'DUPO', 'Ultra Rare'))
    expect(repairs.get('yugioh:10045474~RA01')).toBe(idOf(cards, 'RA01', 'Super Rare'))
    expect(repairs.get('yugioh:10045474~RA01~2')).toBe(idOf(cards, 'RA01', 'Secret Rare'))
    expect(repairs.get('yugioh:10045474~RA01~3')).toBe(idOf(cards, 'RA01', "Collector's Rare"))
  })

  it('falls back to the set, then the regular printing, rather than losing the card', () => {
    const repairs = staleIdRepairs(['yugioh:10045474~RA01~9', 'yugioh:10045474~MAMA', 'yugioh:10045474~RA01~Starlight Rare'], cards)
    expect(repairs.get('yugioh:10045474~RA01~9')).toBe(idOf(cards, 'RA01', 'Super Rare'))
    expect(repairs.get('yugioh:10045474~MAMA')).toBe('yugioh:10045474')
    expect(repairs.get('yugioh:10045474~RA01~Starlight Rare')).toBe(idOf(cards, 'RA01', 'Super Rare'))
  })

  it('never touches a card that is gone, or another game\'s ids', () => {
    const repairs = staleIdRepairs(['yugioh:99999999~LEDE', 'onepiece:OP01-001~2', 'riftbound:gone'], cards)
    expect(repairs.size).toBe(0)
  })
})

describe('applyIdRepairs', () => {
  const deck = (zones: Deck['zones']): Deck => ({ id: 'd1', gameId: 'yugioh', name: 'Blue-Eyes', formatId: 'tcg', zones, freeTextZones: {}, createdAt: 'c', updatedAt: 'u', locked: true })
  const data = (): RepairableData => ({
    decks: [deck({ main: [{ cardId: 'yugioh:1~A', quantity: 2 }, { cardId: 'yugioh:1~A~2', quantity: 1 }, { cardId: 'yugioh:5', quantity: 3 }] })],
    binders: [{ id: 'b1', name: 'Spell Cards Staples', cards: { 'yugioh:1~A': 1, 'yugioh:5': 2 }, createdAt: 'c', updatedAt: 'u' }],
    collection: { 'yugioh:1~A': 2, 'yugioh:new': 1 },
    forTrade: ['yugioh:1~A'],
    wishlist: [{ id: 'w1', gameId: 'yugioh', cardId: 'yugioh:1~A~2', quantity: 1, addedAt: 'x', pushedTaskId: null }],
  })
  const repairs = new Map([['yugioh:1~A', 'yugioh:new'], ['yugioh:1~A~2', 'yugioh:new']])

  it('points every stored reference at the current card and keeps every copy', () => {
    const r = applyIdRepairs(data(), repairs)
    expect(r.data.decks[0].zones.main).toEqual([{ cardId: 'yugioh:new', quantity: 3 }, { cardId: 'yugioh:5', quantity: 3 }])
    expect(r.data.decks[0].updatedAt).toBe('u')
    expect(r.data.decks[0].locked).toBe(true)
    expect(r.data.binders[0].cards).toEqual({ 'yugioh:new': 1, 'yugioh:5': 2 })
    expect(r.data.collection).toEqual({ 'yugioh:new': 3 })
    expect(r.data.forTrade).toEqual(['yugioh:new'])
    expect(r.data.wishlist.map((e) => [e.cardId, e.quantity])).toEqual([['yugioh:new', 1]])
    expect(r.repaired).toBe(5) // 2 deck entries, the binder, collection and wishlist (for-trade is a flag, not a count)
    expect(r.changedDeckIds).toEqual(['d1'])
    expect(r.changedBinderIds).toEqual(['b1'])
  })

  it('reports the sync changes: stale ids to zero, current ids to their new total', () => {
    const r = applyIdRepairs(data(), repairs)
    expect(r.collectionChanges).toEqual([{ cardId: 'yugioh:1~A', quantity: 0 }, { cardId: 'yugioh:new', quantity: 3 }])
    expect(r.wishlistChanges).toEqual([{ cardId: 'yugioh:1~A~2', quantity: 0 }, { cardId: 'yugioh:new', quantity: 1 }])
    expect(r.forTradeChanges).toEqual([{ cardId: 'yugioh:1~A', forTrade: false }, { cardId: 'yugioh:new', forTrade: true }])
  })

  it('returns the same objects when nothing needs repair', () => {
    const d = data()
    const r = applyIdRepairs(d, new Map())
    expect(r.data.decks[0]).toBe(d.decks[0])
    expect(r.data.binders[0]).toBe(d.binders[0])
    expect(r.repaired).toBe(0)
  })

  it('storedCardIds lists every reference', () => {
    expect(new Set(storedCardIds(data()))).toEqual(new Set(['yugioh:1~A', 'yugioh:1~A~2', 'yugioh:5', 'yugioh:new']))
  })
})
