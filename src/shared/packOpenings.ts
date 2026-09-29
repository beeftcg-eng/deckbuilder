import type { Card, GameId } from './types'

/**
 * Pack openings: what you paid for some packs or a box, the cards you pulled, and what those are
 * worth today at the daily prices. Kept in settings (so in backups), one list across games.
 */

export interface PackPull {
  cardId: string
  quantity: number
}

export interface PackOpening {
  id: string
  gameId: GameId
  name: string
  /** YYYY-MM-DD */
  date: string
  /** What you paid, in US dollars (typed in your currency, stored like every other price). */
  costUsd: number | null
  pulls: PackPull[]
  /** Pulls are also added to (and taken back out of) your collection. */
  addToCollection: boolean
}

export function newOpening(gameId: GameId, name: string, costUsd: number | null, addToCollection: boolean, today = new Date()): PackOpening {
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return { id: crypto.randomUUID(), gameId, name, date, costUsd, pulls: [], addToCollection }
}

/** The opening with `delta` more (or fewer) copies of a card; a pull that reaches 0 is dropped. */
export function changePull(opening: PackOpening, cardId: string, delta: number): PackOpening {
  const existing = opening.pulls.find((p) => p.cardId === cardId)
  const quantity = Math.max(0, (existing?.quantity ?? 0) + delta)
  const pulls = existing
    ? opening.pulls.map((p) => (p.cardId === cardId ? { ...p, quantity } : p)).filter((p) => p.quantity > 0)
    : quantity > 0
      ? [{ cardId, quantity }, ...opening.pulls]
      : opening.pulls
  return { ...opening, pulls }
}

export interface OpeningValue {
  /** USD, priced pulls only. */
  value: number
  copies: number
  unpricedCopies: number
  /** Pulls whose card isn't in the loaded data. */
  unknown: number
  best: { card: Card; value: number } | null
  /** value − cost, when the cost is known. */
  result: number | null
  /** result as a fraction of the cost. */
  resultShare: number | null
}

export function openingValue(opening: PackOpening, lookup: (cardId: string) => Card | undefined): OpeningValue {
  let value = 0
  let copies = 0
  let unpricedCopies = 0
  let unknown = 0
  let best: OpeningValue['best'] = null
  for (const { cardId, quantity } of opening.pulls) {
    const card = lookup(cardId)
    copies += quantity
    if (!card) {
      unknown += 1
      continue
    }
    if (card.price == null) {
      unpricedCopies += quantity
      continue
    }
    value += card.price * quantity
    if (!best || card.price > best.value) best = { card, value: card.price }
  }
  const cost = opening.costUsd
  const result = cost != null ? value - cost : null
  return { value, copies, unpricedCopies, unknown, best, result, resultShare: cost ? (value - cost) / cost : null }
}

const GAME_IDS: readonly GameId[] = ['pokemon', 'onepiece', 'riftbound', 'mtg', 'yugioh']

/** Only well-formed openings, as read back from a settings file or a backup. */
export function sanitizePackOpenings(raw: unknown): PackOpening[] {
  if (!Array.isArray(raw)) return []
  const out: PackOpening[] = []
  for (const item of raw.slice(0, 2000)) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.id !== 'string' || typeof o.name !== 'string' || !GAME_IDS.includes(o.gameId as GameId)) continue
    const pulls = Array.isArray(o.pulls)
      ? o.pulls
          .filter((p): p is { cardId: string; quantity: number } => !!p && typeof p.cardId === 'string' && Number.isInteger(p.quantity) && p.quantity > 0)
          .map((p) => ({ cardId: p.cardId, quantity: Math.min(9999, p.quantity) }))
          .slice(0, 5000)
      : []
    out.push({
      id: o.id,
      gameId: o.gameId as GameId,
      name: o.name.slice(0, 120),
      date: typeof o.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : new Date().toISOString().slice(0, 10),
      costUsd: typeof o.costUsd === 'number' && Number.isFinite(o.costUsd) && o.costUsd >= 0 ? o.costUsd : null,
      pulls,
      addToCollection: o.addToCollection !== false,
    })
  }
  return out
}
