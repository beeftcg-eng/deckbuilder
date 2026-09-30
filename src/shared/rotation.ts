import type { Card, Deck, Format } from './types'

/**
 * Cards in a deck that stop being legal at the format's next rotation, so a deck can say so before
 * the day comes. Two sources:
 *  - Magic's Standard: Scryfall's "future" legality, which already reflects the next rotation once
 *    it's announced (a card legal now but not in "future" is rotating).
 *  - Any format with a set list (One Piece, Riftbound): the sets marked as leaving in the ban list
 *    editor (Format.nextRotation), since those games' rotations are kept by hand.
 */

export interface Rotation {
  /** When it happens, if known (YYYY-MM-DD). */
  date: string | null
  /** The deck's cards that leave, with copies, most copies first. */
  cards: { card: Card; quantity: number }[]
  copies: number
}

/** Whether the loaded Magic data knows the upcoming Standard at all (card data synced before it was kept has no "future"). */
export function hasFutureLegality(cards: Iterable<Card>): boolean {
  for (const card of cards) if (card.legality && 'future' in card.legality) return true
  return false
}

const futureCache = new WeakMap<object, boolean>()

/** hasFutureLegality, worked out once per loaded catalog. */
export function futureKnownFor(cardsById: Map<string, Card>): boolean {
  let known = futureCache.get(cardsById)
  if (known === undefined) {
    known = hasFutureLegality(cardsById.values())
    futureCache.set(cardsById, known)
  }
  return known
}

export function isRotating(card: Card, format: Format, futureKnown: boolean): boolean {
  if (card.gameId === 'mtg') {
    return format.id === 'standard' && futureKnown && card.legality?.standard === 'legal' && card.legality?.future !== 'legal'
  }
  const leaving = format.nextRotation?.leavingSetIds
  return Boolean(leaving?.length && leaving.includes(card.setId) && (!format.legalSetIds || format.legalSetIds.includes(card.setId)))
}

/** The deck's rotating cards, or null when none are (or nothing is known about the next rotation). */
export function deckRotation(deck: Pick<Deck, 'zones'>, format: Format | undefined, cardsById: Map<string, Card>, futureKnown: boolean): Rotation | null {
  if (!format) return null
  const byCard = new Map<string, { card: Card; quantity: number }>()
  for (const entries of Object.values(deck.zones)) {
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      if (!card || quantity <= 0 || !isRotating(card, format, futureKnown)) continue
      const had = byCard.get(card.id)
      if (had) had.quantity += quantity
      else byCard.set(card.id, { card, quantity })
    }
  }
  if (byCard.size === 0) return null
  const cards = [...byCard.values()].sort((a, b) => b.quantity - a.quantity || a.card.name.localeCompare(b.card.name))
  return { date: format.nextRotation?.date ?? null, cards, copies: cards.reduce((n, c) => n + c.quantity, 0) }
}
