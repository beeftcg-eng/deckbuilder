/**
 * Loads the TCGplayer price files the phone app's deploy publishes (scripts/build-prices.ts) and
 * applies them to freshly synced cards. Never throws: without a file (offline, not deployed yet) the
 * cards keep whatever prices their own source gave, and a sync keeps prices it already knew.
 */
import type { Card, GameId } from './types'
import { fetchJson } from './games/fetchUtil'
import { PRICE_FILES_URL, type PriceFile } from './priceKeys'

export async function loadPriceFile(game: GameId): Promise<Record<string, number> | null> {
  try {
    const file = await fetchJson<PriceFile>(`${PRICE_FILES_URL}/${game}.json`, 3)
    return file && typeof file.prices === 'object' ? file.prices : null
  } catch {
    return null
  }
}

/** Each card gets the first of its keys' prices found; a card with none keeps its own price. */
export function applyPriceFile(cards: Card[], prices: Record<string, number> | null, keysOf: (card: Card) => string[]): Card[] {
  if (!prices) return cards
  return cards.map((card) => {
    for (const key of keysOf(card)) {
      const price = prices[key]
      if (typeof price === 'number' && price > 0) return { ...card, price }
    }
    return card
  })
}
