import type { Card } from './types'
import { matchRank } from './cardSearch'

/**
 * The card browser's Sort menu. 'relevance' keeps the catalog's own order (each game's source order,
 * e.g. Pokémon's newest set first), or ranks by name match while searching (matchRank).
 */
export const CARD_SORTS = ['relevance', 'name', 'nameDesc', 'newest', 'oldest', 'set', 'costAsc', 'costDesc', 'priceDesc', 'priceAsc'] as const
export type CardSort = (typeof CARD_SORTS)[number]

export function isCardSort(value: unknown): value is CardSort {
  return typeof value === 'string' && (CARD_SORTS as readonly string[]).includes(value)
}

/**
 * A release date as "YYYY-MM-DD", from the shapes the card sources use: "1999/01/09" (Pokémon),
 * "2025-10-31T00:00:00" (Riftcodex), "2002-03-08" (Scryfall, YGOPRODeck). Anything else is undefined.
 */
export function toIsoDate(raw: string | null | undefined): string | undefined {
  const m = raw?.trim().match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Set, then collector number the way it's printed ("2" before "10", "SP-01" after the plain numbers). */
function bySetAndNumber(a: Card, b: Card): number {
  return collator.compare(a.setName, b.setName) || collator.compare(a.number, b.number)
}

function costOf(card: Card): number | null {
  if (card.cost == null || card.cost.trim() === '') return null
  const n = Number(card.cost)
  return Number.isFinite(n) ? n : null
}

/**
 * Compares two optional numbers so a missing one always goes last, whichever way the sort runs
 * (a land has no cost, a card without a price shouldn't lead "Price: high to low").
 */
function missingLast(a: number | null | undefined, b: number | null | undefined, direction: 1 | -1): number {
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return (a - b) * direction
}

function byDate(a: Card, b: Card, direction: 1 | -1): number {
  if (!a.released) return b.released ? 1 : 0
  if (!b.released) return -1
  return a.released.localeCompare(b.released) * direction
}

/**
 * The browser's results in `sort` order. Every sort breaks ties by name, then set and number, so
 * the order is stable and the printings of one card stay together. `query` must already be lower-cased.
 */
export function sortCards(cards: readonly Card[], sort: CardSort, query = ''): Card[] {
  const byName = (a: Card, b: Card) => collator.compare(a.name, b.name) || bySetAndNumber(a, b)
  let compare: (a: Card, b: Card) => number
  switch (sort) {
    case 'relevance':
      if (!query) return cards.slice()
      compare = (a, b) => matchRank(a, query) - matchRank(b, query) || a.name.localeCompare(b.name)
      break
    case 'name':
      compare = byName
      break
    case 'nameDesc':
      compare = (a, b) => byName(b, a)
      break
    case 'newest':
      compare = (a, b) => byDate(a, b, -1) || bySetAndNumber(a, b) || byName(a, b)
      break
    case 'oldest':
      compare = (a, b) => byDate(a, b, 1) || bySetAndNumber(a, b) || byName(a, b)
      break
    case 'set':
      compare = (a, b) => bySetAndNumber(a, b) || byName(a, b)
      break
    case 'costAsc':
      compare = (a, b) => missingLast(costOf(a), costOf(b), 1) || byName(a, b)
      break
    case 'costDesc':
      compare = (a, b) => missingLast(costOf(a), costOf(b), -1) || byName(a, b)
      break
    case 'priceDesc':
      compare = (a, b) => missingLast(a.price, b.price, -1) || byName(a, b)
      break
    case 'priceAsc':
      compare = (a, b) => missingLast(a.price, b.price, 1) || byName(a, b)
      break
  }
  return cards.slice().sort(compare)
}

/** The sorts worth offering for this catalog: no date sorts without release dates, no price sorts without prices. */
export function availableSorts(cards: readonly Card[]): CardSort[] {
  const hasDates = cards.some((c) => c.released)
  const hasCosts = cards.some((c) => costOf(c) != null)
  const hasPrices = cards.some((c) => c.price != null)
  return CARD_SORTS.filter((s) => {
    if (s === 'newest' || s === 'oldest') return hasDates
    if (s === 'costAsc' || s === 'costDesc') return hasCosts
    if (s === 'priceDesc' || s === 'priceAsc') return hasPrices
    return true
  })
}
