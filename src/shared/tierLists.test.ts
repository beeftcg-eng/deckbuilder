import { describe, expect, it } from 'vitest'
import { MAX_CARDS, POOL, addCards, addTier, cardCount, duplicateTierList, moveCard, newTierList, rankedCount, removeCard, removeTier, resetRanks, sanitizeTierLists, shiftTier, spotOf, tierListText } from './tierLists'
import { makeCard } from './testFixtures'

const base = () => newTierList('riftbound', 'Test')

describe('tier lists', () => {
  it('starts with S–D tiers and an empty pool', () => {
    const list = base()
    expect(list.tiers.map((t) => t.label)).toEqual(['S', 'A', 'B', 'C', 'D'])
    expect(cardCount(list)).toBe(0)
  })

  it('adds cards to the pool once, wherever they already are', () => {
    let list = addCards(base(), ['a', 'b', 'a'])
    expect(list.pool).toEqual(['a', 'b'])
    list = moveCard(list, 'a', list.tiers[0].id)
    list = addCards(list, ['a', 'c'])
    expect(list.pool).toEqual(['b', 'c'])
    expect(list.tiers[0].cardIds).toEqual(['a'])
  })

  it('stops at the card limit', () => {
    const ids = Array.from({ length: MAX_CARDS + 5 }, (_, i) => `c${i}`)
    expect(cardCount(addCards(base(), ids))).toBe(MAX_CARDS)
  })

  it('moves a card between tiers, before another card or to the end', () => {
    let list = addCards(base(), ['a', 'b', 'c'])
    const s = list.tiers[0].id
    list = moveCard(list, 'a', s)
    list = moveCard(list, 'b', s)
    list = moveCard(list, 'c', s, 'a')
    expect(list.tiers[0].cardIds).toEqual(['c', 'a', 'b'])
    expect(list.pool).toEqual([])
    list = moveCard(list, 'a', POOL)
    expect(spotOf(list, 'a')).toBe(POOL)
    expect(rankedCount(list)).toBe(2)
    // Unknown tier: nothing happens.
    expect(moveCard(list, 'a', 'nope')).toBe(list)
  })

  it('reorders within the same tier', () => {
    let list = addCards(base(), ['a', 'b', 'c'])
    const s = list.tiers[0].id
    for (const id of ['a', 'b', 'c']) list = moveCard(list, id, s)
    list = moveCard(list, 'c', s, 'a')
    expect(list.tiers[0].cardIds).toEqual(['c', 'a', 'b'])
    expect(moveCard(list, 'a', s, 'a')).toBe(list)
  })

  it('removing a tier puts its cards back in the pool', () => {
    let list = addCards(base(), ['a', 'b'])
    const s = list.tiers[0].id
    list = moveCard(list, 'a', s)
    list = removeTier(list, s)
    expect(list.tiers).toHaveLength(4)
    expect(list.pool).toEqual(['a', 'b'])
  })

  it('adds, shifts and resets tiers', () => {
    let list = addTier(base())
    expect(list.tiers.at(-1)!.label).toBe('E')
    const [first, second] = list.tiers
    list = shiftTier(list, second.id, -1)
    expect(list.tiers[0].id).toBe(second.id)
    expect(shiftTier(list, second.id, -1)).toBe(list)
    list = addCards(list, ['a'])
    list = moveCard(list, 'a', first.id)
    list = resetRanks(list)
    expect(rankedCount(list)).toBe(0)
    expect(list.pool).toEqual(['a'])
    expect(cardCount(removeCard(list, 'a'))).toBe(0)
  })

  it('duplicates with new ids and the same cards', () => {
    let list = addCards(base(), ['a'])
    list = moveCard(list, 'a', list.tiers[1].id)
    const copy = duplicateTierList(list, 'Copy')
    expect(copy.id).not.toBe(list.id)
    expect(copy.tiers[1].id).not.toBe(list.tiers[1].id)
    expect(copy.tiers[1].cardIds).toEqual(['a'])
  })

  it('writes the list as text', () => {
    const card = makeCard('riftbound', { name: 'Jinx' })
    let list = addCards(base(), [card.id, 'gone'])
    list = moveCard(list, card.id, list.tiers[0].id)
    list = moveCard(list, 'gone', list.tiers[0].id)
    expect(tierListText(list, (id) => (id === card.id ? card : undefined)).split('\n')[2]).toBe('S: Jinx, gone')
  })

  it('sanitizes stored lists', () => {
    const good = addCards(base(), ['a', 'b'])
    const bad = { ...good, tiers: [{ id: 't', label: 'X', color: 'red', cardIds: ['a', 5] }] }
    const out = sanitizeTierLists([good, bad, { id: 'x', gameId: 'chess' }, 'nope'], ['riftbound'])
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual(good)
    // A bad color is replaced, a card listed twice keeps its first spot, non-strings are dropped.
    expect(out[1].tiers[0].color).toMatch(/^#/)
    expect(out[1].tiers[0].cardIds).toEqual(['a'])
    expect(out[1].pool).toEqual(['b'])
  })
})
