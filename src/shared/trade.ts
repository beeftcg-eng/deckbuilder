import type { Card, Collection, GameId, TradeListing, TradeWant, WishlistEntry } from './types'
import { gameIdOfCardId } from './collection'

export interface TradeBuildResult<T> {
  entries: T[]
  /** Owned/wanted cards whose game's catalog isn't loaded, so no name/set could be resolved — left out rather than pushed with placeholder data. */
  skipped: number
}

/** Your collection + for-trade flags, resolved against loaded catalogs, ready to push to the cloud. */
export function buildTradeCollection(
  collection: Collection,
  forTrade: ReadonlySet<string>,
  cardsById: (gameId: GameId) => Map<string, Card> | undefined,
): TradeBuildResult<TradeListing> {
  const entries: TradeListing[] = []
  let skipped = 0
  for (const [cardId, quantity] of Object.entries(collection)) {
    if (quantity <= 0) continue
    const gameId = gameIdOfCardId(cardId)
    const card = gameId ? cardsById(gameId)?.get(cardId) : undefined
    if (!card) {
      skipped += 1
      continue
    }
    entries.push({ gameId: card.gameId, cardId, cardName: card.name, setCode: card.setCode, quantity, forTrade: forTrade.has(cardId) })
  }
  return { entries, skipped }
}

/** Your wishlist, resolved against loaded catalogs, ready to push to the cloud as your "wants". */
export function buildTradeWants(
  wishlist: readonly WishlistEntry[],
  cardsById: (gameId: GameId) => Map<string, Card> | undefined,
): TradeBuildResult<TradeWant> {
  const entries: TradeWant[] = []
  let skipped = 0
  for (const w of wishlist) {
    if (w.quantity <= 0) continue
    const card = cardsById(w.gameId)?.get(w.cardId)
    if (!card) {
      skipped += 1
      continue
    }
    entries.push({ gameId: w.gameId, cardId: w.cardId, cardName: card.name, quantity: w.quantity })
  }
  return { entries, skipped }
}
