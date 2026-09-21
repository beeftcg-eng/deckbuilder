import type { Deck } from './types'

export type DeckSortMode = 'recent' | 'name' | 'custom'

export function isDeckSortMode(value: unknown): value is DeckSortMode {
  return value === 'recent' || value === 'name' || value === 'custom'
}

/**
 * Decks in the order to show them. 'custom' follows the saved order; a deck that isn't in it yet (just created or
 * imported) goes first, newest first, so it's never lost at the bottom of a long list.
 */
export function sortDecks(decks: readonly Deck[], mode: DeckSortMode, order: readonly string[] = []): Deck[] {
  const list = [...decks]
  if (mode === 'name') return list.sort((a, b) => a.name.localeCompare(b.name))
  const byRecency = (a: Deck, b: Deck) => b.updatedAt.localeCompare(a.updatedAt)
  if (mode === 'recent') return list.sort(byRecency)
  const position = new Map(order.map((id, index) => [id, index]))
  const unplaced = list.filter((d) => !position.has(d.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const placed = list.filter((d) => position.has(d.id)).sort((a, b) => position.get(a.id)! - position.get(b.id)!)
  return [...unplaced, ...placed]
}

/** `ids` with one moved next to another, before or after it (a drag-and-drop). Unknown ids leave the list unchanged. */
export function reorderByDrop<T extends string>(ids: readonly T[], dragId: T, targetId: T, position: 'before' | 'after'): T[] {
  if (dragId === targetId || !ids.includes(dragId) || !ids.includes(targetId)) return [...ids]
  const without = ids.filter((id) => id !== dragId)
  const at = without.indexOf(targetId) + (position === 'after' ? 1 : 0)
  return [...without.slice(0, at), dragId, ...without.slice(at)]
}

/** `ids` with one moved up (delta -1) or down (+1) a place, stopping at the ends. */
export function moveBy<T extends string>(ids: readonly T[], id: T, delta: number): T[] {
  const from = ids.indexOf(id)
  if (from === -1) return [...ids]
  const to = Math.min(ids.length - 1, Math.max(0, from + delta))
  const next = ids.filter((x) => x !== id)
  next.splice(to, 0, id)
  return next
}

/**
 * The saved order after re-ordering the decks currently on screen (one game's list): those decks lead, in their
 * new order, and every other saved id (other games' decks) keeps its relative order after them.
 */
export function applyVisibleOrder(savedOrder: readonly string[], visibleIds: readonly string[]): string[] {
  const shown = new Set(visibleIds)
  return [...visibleIds, ...savedOrder.filter((id) => !shown.has(id))]
}
