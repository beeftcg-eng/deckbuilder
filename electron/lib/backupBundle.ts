import type { Binder, Collection, Deck, WishlistEntry } from '../../src/shared/types'
import { GAME_LIST } from '../../src/shared/games/registry'
import { t } from '../../src/shared/i18n'

// From the registry, so a newly added game's decks are never silently dropped from a backup or restore.
const GAME_IDS: string[] = GAME_LIST.map((adapter) => adapter.id)
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

function looksLikeBinder(value: unknown): value is Binder {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && isRecord(value.cards)
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
      binders: Binder[] | null
      wishlist: WishlistEntry[] | null
      collection: Collection | null
      /** Deck/binder/wishlist entries that didn't look valid and were left out. */
      skipped: number
    }

/**
 * Validates a parsed backup file before anything on disk is touched. A file with none of
 * decks/binders/wishlist isn't a backup at all (refusing it is what keeps a wrong file pick from
 * wiping everything), and each section is only replaced if the file actually has it.
 */
export function parseBackupBundle(bundle: unknown): ParsedBackup {
  if (!isRecord(bundle) || (!Array.isArray(bundle.decks) && !Array.isArray(bundle.binders) && !Array.isArray(bundle.wishlist))) {
    return { ok: false, error: t.main.notBackup }
  }

  const rawDecks = Array.isArray(bundle.decks) ? bundle.decks : null
  const rawBinders = Array.isArray(bundle.binders) ? bundle.binders : null
  const rawWishlist = Array.isArray(bundle.wishlist) ? bundle.wishlist : null
  const decks = rawDecks?.filter(looksLikeDeck) ?? null
  const binders = rawBinders?.filter(looksLikeBinder) ?? null
  const wishlist = rawWishlist?.filter(looksLikeWishlistEntry) ?? null
  const skipped =
    (rawDecks && decks ? rawDecks.length - decks.length : 0) +
    (rawBinders && binders ? rawBinders.length - binders.length : 0) +
    (rawWishlist && wishlist ? rawWishlist.length - wishlist.length : 0)

  let collection: Collection | null = null
  if (isRecord(bundle.collection)) {
    collection = {}
    for (const [cardId, quantity] of Object.entries(bundle.collection)) {
      if (typeof quantity === 'number' && quantity > 0) collection[cardId] = Math.floor(quantity)
    }
  }

  return { ok: true, decks, binders, wishlist, collection, skipped }
}
