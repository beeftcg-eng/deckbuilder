/**
 * Loads the TCGplayer price files the phone app's deploy publishes (scripts/build-prices.ts) and
 * applies them to freshly synced cards. Never throws: without a file (offline, not deployed yet) the
 * cards keep whatever prices their own source gave, and a sync keeps prices it already knew.
 */
import type { Card, GameId } from './types'
import { fetchJson } from './games/fetchUtil'
import { PRICE_FILES_URL, type PriceFile } from './priceKeys'

export type PriceMaps = Pick<PriceFile, 'prices' | 'foilPrices'>

export async function loadPriceFile(game: GameId): Promise<PriceMaps | null> {
  try {
    const file = await fetchJson<PriceFile>(`${PRICE_FILES_URL}/${game}.json`, 3)
    return file && typeof file.prices === 'object' ? { prices: file.prices, foilPrices: typeof file.foilPrices === 'object' ? file.foilPrices : undefined } : null
  } catch {
    return null
  }
}

function firstPrice(map: Record<string, number> | undefined, keys: string[]): number | null {
  if (!map) return null
  for (const key of keys) {
    const price = map[key]
    if (typeof price === 'number' && price > 0) return price
  }
  return null
}

/**
 * Each card gets the first of its keys' prices found, and its foil price the same way; a card the file
 * doesn't list keeps its own. A file without foil prices leaves foil prices alone.
 */
export function applyPriceFile(cards: Card[], file: PriceMaps | null, keysOf: (card: Card) => string[]): Card[] {
  if (!file) return cards
  return cards.map((card) => {
    const keys = keysOf(card)
    const price = firstPrice(file.prices, keys)
    const foilPrice = firstPrice(file.foilPrices, keys)
    if (price == null && foilPrice == null) return card
    return { ...card, ...(price != null ? { price } : {}), ...(foilPrice != null ? { foilPrice } : {}) }
  })
}
