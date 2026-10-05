import type { Card, DeckRules } from './types'
import { getAdapter } from './games/registry'
import { normalizeName, poolKey } from './collection'

/**
 * Spare copies: the ones you own beyond what a deck can hold, which are free to trade or sell. Every
 * printing of a card counts towards its limit together (Riftbound's alternate art and Overnumbered
 * printings are the same card as the regular one), as the deck's copy limit counts them.
 */

export interface SparePrinting {
  card: Card
  copies: number
}

export interface SpareGroup {
  key: string
  /** The card's name without a printing's suffix ("Ahri, Alluring", not "... (Alternate Art)"). */
  name: string
  printings: SparePrinting[]
  owned: number
  /** Copies a deck can hold. */
  limit: number
  spare: number
  /** What the spare copies are worth, counting the cheapest ones as the spares (you keep the best). */
  spareValue: number
}

// Where a card goes in a deck: the first zone that takes it, skipping ones only filled deliberately.
function zoneLimit(card: Card, rules: DeckRules): number | null {
  const zone = rules.zones.find((z) => !z.freeText && !z.manualOnly && z.match(card))
  if (!zone) return null // a rune, DON!!: no zone holds the card itself
  const adapter = getAdapter(card.gameId)
  return adapter.copyLimitFor?.(card) ?? zone.maxCopiesPerCard ?? rules.defaultMaxCopiesPerCard
}

// A card's printings under one name, as the deck's copy limit counts them (GameAdapter.copyName).
function copyName(card: Card): string {
  return getAdapter(card.gameId).copyName?.(card) ?? card.name
}

function sameCardKey(card: Card): string {
  return getAdapter(card.gameId).copyName ? `${card.gameId}:${normalizeName(copyName(card))}` : poolKey(card)
}

export function spareCopies(owned: readonly SparePrinting[]): SpareGroup[] {
  const groups = new Map<string, { printings: SparePrinting[]; limit: number }>()
  for (const entry of owned) {
    if (entry.copies <= 0) continue
    const limit = zoneLimit(entry.card, getAdapter(entry.card.gameId).deckRules)
    if (limit == null || !Number.isFinite(limit)) continue
    const key = sameCardKey(entry.card)
    const group = groups.get(key)
    if (group) {
      group.printings.push(entry)
      group.limit = Math.max(group.limit, limit)
    } else {
      groups.set(key, { printings: [entry], limit })
    }
  }

  const spares: SpareGroup[] = []
  for (const [key, { printings, limit }] of groups) {
    const ownedCopies = printings.reduce((n, p) => n + p.copies, 0)
    const spare = ownedCopies - limit
    if (spare <= 0) continue
    const prices = printings.flatMap((p) => Array<number>(p.copies).fill(p.card.price ?? 0)).sort((a, b) => a - b)
    const first = printings[0].card
    spares.push({
      key,
      name: copyName(first),
      printings: [...printings].sort((a, b) => (b.card.price ?? 0) - (a.card.price ?? 0)),
      owned: ownedCopies,
      limit,
      spare,
      spareValue: prices.slice(0, spare).reduce((sum, p) => sum + p, 0),
    })
  }
  return spares.sort((a, b) => b.spareValue - a.spareValue || b.spare - a.spare || a.name.localeCompare(b.name))
}
