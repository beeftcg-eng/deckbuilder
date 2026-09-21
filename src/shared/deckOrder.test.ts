import { describe, expect, it } from 'vitest'
import { applyVisibleOrder, isDeckSortMode, moveBy, reorderByDrop, sortDecks } from './deckOrder'
import { makeDeck } from './testFixtures'

const deck = (id: string, name: string, created: string, updated = created) => ({ ...makeDeck('mtg', {}), id, name, createdAt: created, updatedAt: updated })
const a = deck('a', 'Alpha', '2026-01-01', '2026-03-01')
const b = deck('b', 'Bravo', '2026-01-02', '2026-01-02')
const c = deck('c', 'Charlie', '2026-01-03', '2026-02-01')
const ids = (list: { id: string }[]) => list.map((d) => d.id)

describe('sortDecks', () => {
  it('sorts by recent edit and by name', () => {
    expect(ids(sortDecks([a, b, c], 'recent'))).toEqual(['a', 'c', 'b'])
    expect(ids(sortDecks([c, b, a], 'name'))).toEqual(['a', 'b', 'c'])
  })
  it('follows the saved custom order', () => {
    expect(ids(sortDecks([a, b, c], 'custom', ['c', 'a', 'b']))).toEqual(['c', 'a', 'b'])
  })
  it('puts decks missing from the saved order first, newest first, and ignores saved ids that no longer exist', () => {
    expect(ids(sortDecks([a, b, c], 'custom', ['gone', 'b']))).toEqual(['c', 'a', 'b'])
    expect(ids(sortDecks([a, b, c], 'custom'))).toEqual(['c', 'b', 'a']) // no saved order at all: newest created first
  })
  it('does not mutate its input', () => {
    const input = [c, a, b]
    sortDecks(input, 'name')
    expect(ids(input)).toEqual(['c', 'a', 'b'])
  })
})

describe('reorderByDrop', () => {
  const list = ['a', 'b', 'c', 'd']
  it('moves a deck before or after another', () => {
    expect(reorderByDrop(list, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd'])
    expect(reorderByDrop(list, 'a', 'c', 'after')).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderByDrop(list, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c'])
    expect(reorderByDrop(list, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a'])
  })
  it('is a no-op for dropping on itself or unknown ids', () => {
    expect(reorderByDrop(list, 'b', 'b', 'after')).toEqual(list)
    expect(reorderByDrop(list, 'x', 'a', 'before')).toEqual(list)
    expect(reorderByDrop(list, 'a', 'x', 'before')).toEqual(list)
  })
  it('keeps every deck exactly once', () => {
    for (const drag of list) for (const target of list) for (const pos of ['before', 'after'] as const) expect([...reorderByDrop(list, drag, target, pos)].sort()).toEqual(list)
  })
})

describe('moveBy', () => {
  it('moves a deck one place and stops at the ends', () => {
    expect(moveBy(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveBy(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
    expect(moveBy(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveBy(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(moveBy(['a', 'b'], 'z', 1)).toEqual(['a', 'b'])
  })
})

describe('applyVisibleOrder', () => {
  it('puts the reordered decks first and keeps other games’ saved order behind them', () => {
    expect(applyVisibleOrder(['x', 'a', 'y', 'b'], ['b', 'a'])).toEqual(['b', 'a', 'x', 'y'])
    expect(applyVisibleOrder([], ['a', 'b'])).toEqual(['a', 'b'])
  })
})

describe('isDeckSortMode', () => {
  it('accepts the three modes only', () => {
    expect(['recent', 'name', 'custom'].every(isDeckSortMode)).toBe(true)
    expect([undefined, 'random', 3].some(isDeckSortMode)).toBe(false)
  })
})
