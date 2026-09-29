import type { Card, Deck, DeckCardEntry } from './types'
import { missingForDeck, normalizeName, poolKey } from './collection'
import { isAlternateArt, rarityRank } from './printings'

/**
 * What it costs to finish a deck: the copies you don't own, each at the cheapest printing that is the
 * same card (or at the deck's own printing, if you'd rather), with the list in the text TCGplayer's
 * Mass Entry box reads.
 */

export type BuyMode = 'cheapest' | 'deck'

export interface BuyRow {
  /** The printing to buy. */
  card: Card
  /** The printing the deck uses. */
  deckCard: Card
  quantity: number
  /** USD per copy, when there is a price. */
  unitPrice: number | null
}

export interface BuyList {
  rows: BuyRow[]
  /** USD for the priced rows. */
  total: number
  unpricedCopies: number
  /** USD the same copies cost at the deck's own printings (priced rows only), to show what picking the cheapest saves. */
  deckPrintingsTotal: number
}

const printingIndex = new WeakMap<readonly Card[], Map<string, Card[]>>()

function printingsByPool(cards: readonly Card[]): Map<string, Card[]> {
  let index = printingIndex.get(cards)
  if (!index) {
    index = new Map()
    for (const card of cards) {
      const key = poolKey(card)
      const list = index.get(key)
      if (list) list.push(card)
      else index.set(key, [card])
    }
    printingIndex.set(cards, index)
  }
  return index
}

function sameText(a: Card, b: Card): boolean {
  if (a.text == null || b.text == null) return true
  return normalizeName(a.text) === normalizeName(b.text)
}

/**
 * The cheapest priced printing of `card`. Only printings with the same rules text count: Pokémon's
 * copy limit goes by name, but two different "Pikachu" cards aren't interchangeable in a deck. Ties go
 * to the regular printing over an alternate art, then the lower rarity.
 */
export function cheapestPrinting(card: Card, cards: readonly Card[], accept: (c: Card) => boolean = () => true): Card {
  const candidates = (printingsByPool(cards).get(poolKey(card)) ?? []).filter((c) => c.price != null && sameText(c, card) && accept(c))
  if (card.price != null && !candidates.includes(card)) candidates.push(card)
  if (candidates.length === 0) return card
  return candidates.reduce((best, c) => {
    const d = c.price! - best.price!
    if (d !== 0) return d < 0 ? c : best
    const alt = Number(isAlternateArt(c)) - Number(isAlternateArt(best))
    if (alt !== 0) return alt < 0 ? c : best
    return rarityRank(c.rarity) < rarityRank(best.rarity) ? c : best
  })
}

export function buyList(deck: Deck, cardsById: Map<string, Card>, cards: readonly Card[], owned: Map<string, number>, mode: BuyMode): BuyList {
  const rows: BuyRow[] = []
  let total = 0
  let unpricedCopies = 0
  let deckPrintingsTotal = 0
  for (const { card: deckCard, quantity } of missingForDeck(deck, cardsById, owned)) {
    const card = mode === 'cheapest' ? cheapestPrinting(deckCard, cards) : deckCard
    const unitPrice = card.price ?? null
    rows.push({ card, deckCard, quantity, unitPrice })
    if (unitPrice == null) unpricedCopies += quantity
    else {
      total += unitPrice * quantity
      deckPrintingsTotal += (deckCard.price ?? unitPrice) * quantity
    }
  }
  rows.sort((a, b) => (b.unitPrice ?? -1) * b.quantity - (a.unitPrice ?? -1) * a.quantity || a.card.name.localeCompare(b.card.name))
  return { rows, total, unpricedCopies, deckPrintingsTotal }
}

/**
 * The list for TCGplayer's Mass Entry box: "4 Lightning Bolt [2XM]" for Magic (it matches the set
 * code), "4 Name" for the other games, whose names there don't carry this app's printing notes.
 */
export function massEntryText(rows: readonly BuyRow[]): string {
  return rows
    .map(({ card, quantity }) =>
      card.gameId === 'mtg' ? `${quantity} ${card.name} [${card.setCode}]` : `${quantity} ${card.name.replace(/\s*\([^)]*\)\s*$/, '')}`,
    )
    .join('\n')
}

export const MASS_ENTRY_URL = 'https://www.tcgplayer.com/massentry'

export interface CheaperDeck {
  deck: Deck
  /** Copies that moved to a different printing. */
  changedCopies: number
  /** USD the deck's priced cards cost before and after. */
  before: number
  after: number
}

/**
 * The deck with each card at its cheapest printing of the same card: for decks built or imported
 * before imports picked cheap printings. A printing you own stays (it's the one you'd play), and the
 * replacement must pass `legal` (a cheaper reprint can be from a rotated-out set). Copies that end
 * up on the same printing are merged, in the place the first of them was.
 */
export function withCheapestPrintings(
  deck: Deck,
  cardsById: Map<string, Card>,
  cards: readonly Card[],
  owned: (cardId: string) => number,
  legal: (card: Card) => boolean = () => true,
): CheaperDeck {
  let changedCopies = 0
  let before = 0
  let after = 0
  const zones: Record<string, DeckCardEntry[]> = {}
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    const merged = new Map<string, number>()
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      const target = card && owned(card.id) === 0 ? cheapestPrinting(card, cards, legal) : card
      const id = target?.id ?? cardId
      if (card && target && target.id !== card.id) changedCopies += quantity
      before += (card?.price ?? 0) * quantity
      after += (target?.price ?? card?.price ?? 0) * quantity
      merged.set(id, (merged.get(id) ?? 0) + quantity)
    }
    zones[zoneId] = [...merged].map(([cardId, quantity]) => ({ cardId, quantity }))
  }
  return { deck: changedCopies > 0 ? { ...deck, zones } : deck, changedCopies, before, after }
}
