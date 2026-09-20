import type { Collection, Deck, WishlistEntry } from '../../src/shared/types'

const GAME_IDS = ['pokemon', 'onepiece', 'riftbound']
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

function looksLikeDeck(value: unknown): value is Deck {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.gameId === 'string' &&
    GAME_IDS.includes(value.gameId) &&
    typeof value.name === 'string' &&
    isRecord(value.zones)
  )
}

function looksLikeWishlistEntry(value: unknown): value is WishlistEntry {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.gameId === 'string' &&
    GAME_IDS.includes(value.gameId) &&
    typeof value.cardId === 'string' &&
    typeof value.quantity === 'number'
  )
}

export type ParsedBackup =
  | { ok: false; error: string }
  | {
      ok: true
      /** Each is null when the file doesn't contain that section — those are left untouched on restore. */
      decks: Deck[] | null
      wishlist: WishlistEntry[] | null
      collection: Collection | null
      /** Deck/wishlist entries that didn't look valid and were left out. */
      skipped: number
    }

/**
 * Validates a parsed backup file before anything on disk is touched. A file
 * with neither decks nor wishlist isn't a backup at all (refusing it is what
 * keeps a wrong file pick from wiping everything), and each section is only
 * replaced if the file actually has it.
 */
export function parseBackupBundle(bundle: unknown): ParsedBackup {
  if (!isRecord(bundle) || (!Array.isArray(bundle.decks) && !Array.isArray(bundle.wishlist))) {
    return { ok: false, error: "That file isn't a Deckbuilder backup (no decks or wishlist in it)." }
  }

  const rawDecks = Array.isArray(bundle.decks) ? bundle.decks : null
  const rawWishlist = Array.isArray(bundle.wishlist) ? bundle.wishlist : null
  const decks = rawDecks?.filter(looksLikeDeck) ?? null
  const wishlist = rawWishlist?.filter(looksLikeWishlistEntry) ?? null
  const skipped = (rawDecks && decks ? rawDecks.length - decks.length : 0) + (rawWishlist && wishlist ? rawWishlist.length - wishlist.length : 0)

  let collection: Collection | null = null
  if (isRecord(bundle.collection)) {
    collection = {}
    for (const [cardId, quantity] of Object.entries(bundle.collection)) {
      if (typeof quantity === 'number' && quantity > 0) collection[cardId] = Math.floor(quantity)
    }
  }

  return { ok: true, decks, wishlist, collection, skipped }
}
