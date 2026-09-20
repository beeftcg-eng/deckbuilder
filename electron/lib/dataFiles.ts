import type { Collection, Deck, WishlistEntry } from '../../src/shared/types'
import { collectionFile, decksFile, wishlistFile } from './paths'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from './jsonStore'
import { maybeSnapshot } from './backups'

/**
 * decks.json, wishlist.json and collection.json share one queue: backup
 * restore rewrites all three and should never interleave with a normal save.
 */
export function withDataLock<T>(task: () => Promise<T>): Promise<T> {
  return withLock('data', task)
}

export const readDecks = () => readJsonFile<Deck[]>(decksFile(), [], Array.isArray)
export const readWishlist = () => readJsonFile<WishlistEntry[]>(wishlistFile(), [], Array.isArray)
export const readCollection = () => readJsonFile<Collection>(collectionFile(), {}, isPlainObject)

export async function writeDecks(decks: Deck[]): Promise<void> {
  await maybeSnapshot()
  await writeJsonAtomic(decksFile(), decks)
}

export async function writeWishlist(entries: WishlistEntry[]): Promise<void> {
  await maybeSnapshot()
  await writeJsonAtomic(wishlistFile(), entries)
}

export async function writeCollection(collection: Collection): Promise<void> {
  await maybeSnapshot()
  await writeJsonAtomic(collectionFile(), collection)
}
