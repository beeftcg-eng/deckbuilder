import type { Card, Deck, DeckRules, DeckViewMode } from './types'
import { poolKey } from './collection'

export const DECK_VIEW_MODES: readonly DeckViewMode[] = ['grid', 'list', 'text']

export const DECK_VIEW_MODE_LABELS: Record<DeckViewMode, string> = { grid: 'Grid', list: 'List', text: 'Text' }

export function isDeckViewMode(value: unknown): value is DeckViewMode {
  return typeof value === 'string' && (DECK_VIEW_MODES as readonly string[]).includes(value)
}

export interface DeckViewEntry {
  /** The first printing in the deck, when several printings of one card were merged. */
  card: Card
  quantity: number
  /** How many different printings (set/rarity) these copies are; 1 for a single printing. */
  printings: number
  /** Each printing merged into this entry with its own copies, in the zone's order (`card` is the first). */
  copies: { card: Card; quantity: number }[]
}

/** Cards of one type within a zone, e.g. the Creatures in a Main Deck. */
export interface DeckViewGroup {
  category: string
  /** Copies, not distinct cards. */
  count: number
  entries: DeckViewEntry[]
}

export interface DeckViewSection {
  zoneId: string
  label: string
  /** Copies in the zone. */
  count: number
  groups: DeckViewGroup[]
  /** Free-text zones (Riftbound's rune deck) list labels instead of cards. */
  chips: { label: string; quantity: number }[]
}

function costOf(card: Card): number {
  const cost = card.cost == null ? NaN : Number(card.cost)
  return Number.isFinite(cost) ? cost : Infinity // no cost (lands, Legends) sorts after the costed cards
}

/** Cheaper cards first, then by name. */
export function compareByCostThenName(a: Card, b: Card): number {
  return costOf(a) - costOf(b) || a.name.localeCompare(b.name)
}

const sum = (entries: { quantity: number }[]) => entries.reduce((total, e) => total + e.quantity, 0)

/**
 * What the full-screen deck view shows: one section per non-empty zone, in the game's zone order,
 * each split by card type. Types and the cards within them come in the order the deck editor has
 * them (so a deck arranged there looks the same here), and printings of one card - the same card
 * by the game's own copy-limit rule (collection.ts poolKey: by name, or by card number for One
 * Piece) - are one entry with their copies added up, not a row per set or rarity. Cards missing
 * from the loaded catalog (its game hasn't been synced) are left out, as in the exported image.
 */
export function buildDeckView(deck: Deck, rules: DeckRules, cardsById: Map<string, Card>): DeckViewSection[] {
  const sections: DeckViewSection[] = []

  for (const zone of rules.zones) {
    if (zone.freeText) {
      const chips = (deck.freeTextZones[zone.id] ?? []).filter((e) => e.quantity > 0)
      if (chips.length > 0) sections.push({ zoneId: zone.id, label: zone.label, count: sum(chips), groups: [], chips })
      continue
    }

    const entries = mergePrintings(deck.zones[zone.id] ?? [], cardsById)
    const byCategory = new Map<string, DeckViewEntry[]>() // Map keeps first-appearance order
    for (const entry of entries) {
      const list = byCategory.get(entry.card.category) ?? []
      list.push(entry)
      byCategory.set(entry.card.category, list)
    }
    if (byCategory.size === 0) continue

    const groups: DeckViewGroup[] = [...byCategory.entries()].map(([category, list]) => ({ category, count: sum(list), entries: list }))
    sections.push({ zoneId: zone.id, label: zone.label, count: groups.reduce((total, g) => total + g.count, 0), groups, chips: [] })
  }

  return sections
}

/** A zone's entries with every printing of one card merged into its first, in the zone's order. */
export function mergePrintings(entries: { cardId: string; quantity: number }[], cardsById: Map<string, Card>): DeckViewEntry[] {
  const merged = new Map<string, DeckViewEntry>()
  for (const { cardId, quantity } of entries) {
    const card = cardsById.get(cardId)
    if (!card || quantity <= 0) continue
    const key = poolKey(card)
    const existing = merged.get(key)
    if (existing) {
      existing.quantity += quantity
      existing.printings++
      existing.copies.push({ card, quantity })
    } else merged.set(key, { card, quantity, printings: 1, copies: [{ card, quantity }] })
  }
  return [...merged.values()]
}

/** The plain-text list split into its blank-line-separated blocks, so they can be laid out in columns without splitting one. */
export function textBlocks(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trimEnd())
    .filter((block) => block.trim() !== '')
}
