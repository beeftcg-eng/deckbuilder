import type { Deck } from './types'

/**
 * Deck folders are just a name on each deck (Deck.folder): a folder exists while a deck is in it, so
 * there's nothing to create, rename or clean up separately, and it syncs with the deck.
 */

/** Every folder in use, A–Z. */
export function deckFolders(decks: readonly Deck[]): string[] {
  return [...new Set(decks.map((d) => d.folder).filter((f): f is string => Boolean(f)))].sort((a, b) => a.localeCompare(b))
}

export interface FolderGroup {
  /** null for the decks that aren't in a folder. */
  folder: string | null
  decks: Deck[]
}

/** `decks` (already in the order to show) split by folder: the ones in no folder first, then each folder A–Z. */
export function groupByFolder(decks: readonly Deck[]): FolderGroup[] {
  const unfiled = decks.filter((d) => !d.folder)
  const groups: FolderGroup[] = deckFolders(decks).map((folder) => ({ folder, decks: decks.filter((d) => d.folder === folder) }))
  return unfiled.length > 0 ? [{ folder: null, decks: unfiled }, ...groups] : groups
}
