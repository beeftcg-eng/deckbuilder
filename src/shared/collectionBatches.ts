import type { Collection, GameId } from './types'
import { gameIdOfCardId } from './collection'

/**
 * Collection batches: changes made to the collection many cards at a time (an import, a scanning
 * session, a set's "Add missing", deleting a selection, clearing a game's collection), kept so a
 * whole batch can be undone later. Kept in settings on this device only (not synced): undoing one
 * is itself an ordinary collection change, which syncs like any other.
 */

/** Where a batch came from: a CSV import, a scanner session, a set's "Add missing", a deleted selection, a cleared game. */
export type BatchSource = 'import' | 'scan' | 'set' | 'delete' | 'clear'

export interface BatchItem {
  cardId: string
  /** Copies added (positive) or removed (negative). */
  quantity: number
}

export interface CollectionBatch {
  id: string
  gameId: GameId
  source: BatchSource
  /** ISO timestamp. */
  at: string
  items: BatchItem[]
}

/** Only the newest batches are kept. */
export const MAX_BATCHES = 20
const MAX_ITEMS = 20000
const SOURCES: readonly BatchSource[] = ['import', 'scan', 'set', 'delete', 'clear']

/** A batch of `items`, with repeats of a card merged and cards that net to nothing dropped; null when nothing's left. */
export function newBatch(gameId: GameId, source: BatchSource, items: readonly BatchItem[], now = new Date()): CollectionBatch | null {
  const net = new Map<string, number>()
  for (const { cardId, quantity } of items) net.set(cardId, (net.get(cardId) ?? 0) + quantity)
  const merged = [...net].filter(([, quantity]) => quantity !== 0).map(([cardId, quantity]) => ({ cardId, quantity }))
  if (merged.length === 0) return null
  return { id: crypto.randomUUID(), gameId, source, at: now.toISOString(), items: merged }
}

/** The list with `batch` added at the front, trimmed to MAX_BATCHES. */
export function withBatch(batches: readonly CollectionBatch[], batch: CollectionBatch): CollectionBatch[] {
  return [batch, ...batches].slice(0, MAX_BATCHES)
}

/** Copies a batch added (positive items) and removed (negative ones). */
export function batchCopies(batch: CollectionBatch): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const { quantity } of batch.items) {
    if (quantity > 0) added += quantity
    else removed -= quantity
  }
  return { added, removed }
}

/**
 * The collection change that undoes a batch: what it removed goes back, and what it added comes
 * out again, but only as many copies as are still owned (some may have been taken out since).
 */
export function undoItems(batch: CollectionBatch, collection: Collection): BatchItem[] {
  const out: BatchItem[] = []
  for (const { cardId, quantity } of batch.items) {
    if (quantity < 0) out.push({ cardId, quantity: -quantity })
    else {
      const owned = Math.min(quantity, collection[cardId] ?? 0)
      if (owned > 0) out.push({ cardId, quantity: -owned })
    }
  }
  return out
}

/** The change that removes every copy of `cardIds` you own. */
export function removalItems(collection: Collection, cardIds: Iterable<string>): BatchItem[] {
  const out: BatchItem[] = []
  for (const cardId of new Set(cardIds)) {
    const owned = collection[cardId] ?? 0
    if (owned > 0) out.push({ cardId, quantity: -owned })
  }
  return out
}

/** Every card of one game in the collection, including ones the loaded card data doesn't have. */
export function cardIdsOfGame(collection: Collection, gameId: GameId): string[] {
  return Object.keys(collection).filter((cardId) => gameIdOfCardId(cardId) === gameId)
}

/** Only well-formed batches, as read back from a settings file or a backup. */
export function sanitizeCollectionBatches(raw: unknown, gameIds: readonly GameId[]): CollectionBatch[] {
  if (!Array.isArray(raw)) return []
  const out: CollectionBatch[] = []
  for (const item of raw.slice(0, MAX_BATCHES)) {
    if (!item || typeof item !== 'object') continue
    const b = item as Record<string, unknown>
    if (typeof b.id !== 'string' || !gameIds.includes(b.gameId as GameId) || !SOURCES.includes(b.source as BatchSource)) continue
    if (typeof b.at !== 'string' || Number.isNaN(Date.parse(b.at)) || !Array.isArray(b.items)) continue
    const items = b.items
      .filter((i): i is BatchItem => !!i && typeof i.cardId === 'string' && Number.isInteger(i.quantity) && i.quantity !== 0)
      .slice(0, MAX_ITEMS)
      .map((i) => ({ cardId: i.cardId, quantity: Math.max(-9999, Math.min(9999, i.quantity)) }))
    if (items.length > 0) out.push({ id: b.id, gameId: b.gameId as GameId, source: b.source as BatchSource, at: b.at, items })
  }
  return out
}
