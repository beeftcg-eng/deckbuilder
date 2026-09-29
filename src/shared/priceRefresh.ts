/**
 * Daily price updates without re-downloading the card catalog. The phone app's site publishes
 * prices/<game>.json every day (scripts/build-prices.ts); a card's price is looked up under the keys
 * below and the saved catalog is updated in place. Riftbound, Pokémon and Yu-Gi-Oh! are keyed the
 * way TCGplayer names cards (priceKeys.ts); One Piece and Magic, whose prices come from their own
 * card sources, are keyed by this app's card id (the daily build runs the same download code).
 */
import type { Card, GameId } from './types'
import { applyPriceFile } from './priceFiles'
import { PRICE_FILES_URL, pokemonKeys, riftboundKeys, yugiohKeys, type PriceFile } from './priceKeys'
import { fetchJson } from './games/fetchUtil'

/** Games whose price file is keyed by card id (without the "<game>:" prefix, to keep the files small). */
export const ID_KEYED_GAMES: readonly GameId[] = ['onepiece', 'mtg']

export function idKey(card: Card): string {
  return card.id.slice(card.gameId.length + 1)
}

export function priceKeysFor(card: Card): string[] {
  switch (card.gameId) {
    case 'riftbound':
      return riftboundKeys(card.tcgplayerId, card.sourceId)
    case 'pokemon':
      return pokemonKeys(card.setCode, card.setId, card.number)
    case 'yugioh':
      return card.number ? yugiohKeys(card.setCode, card.number, card.rarity) : []
    default:
      return [idKey(card)]
  }
}

/** Today's price file for a game, or null when it's unreachable or not newer than `since`. */
export async function fetchPriceUpdate(gameId: GameId, since?: string | null): Promise<PriceFile | null> {
  try {
    const file = await fetchJson<PriceFile>(`${PRICE_FILES_URL}/${gameId}.json`, 3)
    if (!file || typeof file.prices !== 'object' || typeof file.updatedAt !== 'string') return null
    return since && file.updatedAt <= since ? null : file
  } catch {
    return null
  }
}

/** The cards with today's prices, and how many changed. A card the file doesn't list keeps its price. */
export function applyPriceUpdate(cards: Card[], file: PriceFile): { cards: Card[]; changed: number } {
  const updated = applyPriceFile(cards, file.prices, priceKeysFor)
  let changed = 0
  for (let i = 0; i < cards.length; i++) if (updated[i].price !== cards[i].price) changed++
  return { cards: updated, changed }
}
