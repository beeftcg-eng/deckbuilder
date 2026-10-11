import type { Card } from './types'

/**
 * Each set's release date, from its cards: their set's own date where the game has one (Card.setReleased),
 * else the printing's. The latest one wins, so a Yu-Gi-Oh set synced before set dates existed still lands
 * near its release - its reprints carry their first printing's older date, its new cards the set's.
 */
export function setReleaseDates(cards: Iterable<Card>): Map<string, string> {
  const dates = new Map<string, string>()
  for (const card of cards) {
    const date = card.setReleased ?? card.released
    if (!date) continue
    const known = dates.get(card.setId)
    if (!known || date > known) dates.set(card.setId, date)
  }
  return dates
}

/** Sorts sets newest first by release date; sets with no date go last, A–Z by name. */
export function sortSetsByRelease<T>(sets: T[], dates: Map<string, string>, idOf: (set: T) => string, nameOf: (set: T) => string): T[] {
  return [...sets].sort((a, b) => {
    const da = dates.get(idOf(a)) ?? ''
    const db = dates.get(idOf(b)) ?? ''
    if (da !== db) return da && db ? db.localeCompare(da) : da ? -1 : 1
    return nameOf(a).localeCompare(nameOf(b))
  })
}
