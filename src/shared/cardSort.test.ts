import { describe, expect, it } from 'vitest'
import { availableSorts, isCardSort, sortCards, toIsoDate } from './cardSort'
import { makeCard } from './testFixtures'
import type { Card } from './types'

const card = (name: string, extra: Partial<Card> = {}) => makeCard('riftbound', { ...extra, name })
const names = (cards: { name: string }[]) => cards.map((c) => c.name)

const jinx = card('Jinx', { setName: 'Origins', number: '10', released: '2025-10-31', cost: '3', price: 1 })
const annie = card('Annie', { setName: 'Origins', number: '2', released: '2025-10-31', cost: '5', price: null })
const viktor = card('Viktor', { setName: 'Spiritforged', number: '1', released: '2026-02-13', cost: null, price: 12 })
const yasuo = card('yasuo', { setName: 'Unleashed', number: '7', cost: '1', price: 0.5 }) // no date: old card data
const catalog = [jinx, annie, viktor, yasuo]

describe('sortCards', () => {
  it('keeps the catalog order for Best match without a search', () => {
    expect(names(sortCards(catalog, 'relevance'))).toEqual(['Jinx', 'Annie', 'Viktor', 'yasuo'])
  })

  it('ranks name matches first for Best match while searching', () => {
    const text = card('Zed', { text: 'Deal damage to Annie.' })
    expect(names(sortCards([text, annie], 'relevance', 'annie'))).toEqual(['Annie', 'Zed'])
  })

  it('sorts by name either way, ignoring case', () => {
    expect(names(sortCards(catalog, 'name'))).toEqual(['Annie', 'Jinx', 'Viktor', 'yasuo'])
    expect(names(sortCards(catalog, 'nameDesc'))).toEqual(['yasuo', 'Viktor', 'Jinx', 'Annie'])
  })

  it('sorts by release date, with undated cards last either way and same-day cards by set and number', () => {
    expect(names(sortCards(catalog, 'newest'))).toEqual(['Viktor', 'Annie', 'Jinx', 'yasuo'])
    expect(names(sortCards(catalog, 'oldest'))).toEqual(['Annie', 'Jinx', 'Viktor', 'yasuo'])
  })

  it('groups by expansion, numbers in printed order (2 before 10)', () => {
    expect(names(sortCards(catalog, 'set'))).toEqual(['Annie', 'Jinx', 'Viktor', 'yasuo'])
  })

  it('sorts by cost and price with missing values last both ways', () => {
    expect(names(sortCards(catalog, 'costAsc'))).toEqual(['yasuo', 'Jinx', 'Annie', 'Viktor'])
    expect(names(sortCards(catalog, 'costDesc'))).toEqual(['Annie', 'Jinx', 'yasuo', 'Viktor'])
    expect(names(sortCards(catalog, 'priceDesc'))).toEqual(['Viktor', 'Jinx', 'yasuo', 'Annie'])
    expect(names(sortCards(catalog, 'priceAsc'))).toEqual(['yasuo', 'Jinx', 'Viktor', 'Annie'])
  })

  it('does not change the list it was given', () => {
    const copy = catalog.slice()
    sortCards(catalog, 'name')
    expect(catalog).toEqual(copy)
  })
})

describe('availableSorts', () => {
  it('offers every sort when cards have dates, costs and prices', () => {
    expect(availableSorts(catalog)).toHaveLength(10)
  })

  it('leaves out date, cost and price sorts the card data cannot support', () => {
    const bare = [card('A'), card('B')]
    expect(availableSorts(bare)).toEqual(['relevance', 'name', 'nameDesc', 'set'])
  })
})

describe('toIsoDate', () => {
  it('reads each source’s date shape', () => {
    expect(toIsoDate('1999/01/09')).toBe('1999-01-09')
    expect(toIsoDate('2025-10-31T00:00:00')).toBe('2025-10-31')
    expect(toIsoDate('2002-03-08')).toBe('2002-03-08')
  })

  it('gives undefined for anything else', () => {
    expect(toIsoDate(undefined)).toBeUndefined()
    expect(toIsoDate(null)).toBeUndefined()
    expect(toIsoDate('soon')).toBeUndefined()
  })
})

describe('isCardSort', () => {
  it('accepts only known sorts (a stale saved value falls back)', () => {
    expect(isCardSort('newest')).toBe(true)
    expect(isCardSort('bogus')).toBe(false)
    expect(isCardSort(null)).toBe(false)
  })
})
