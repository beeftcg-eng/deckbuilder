import type { Card, Deck, DeckRules, DeckViewMode } from './types'

export const DECK_VIEW_MODES: readonly DeckViewMode[] = ['grid', 'list', 'text']

export const DECK_VIEW_MODE_LABELS: Record<DeckViewMode, string> = { grid: 'Grid', list: 'List', text: 'Text' }

export function isDeckViewMode(value: unknown): value is DeckViewMode {
  return typeof value === 'string' && (DECK_VIEW_MODES as readonly string[]).includes(value)
}

export interface DeckViewEntry {
  card: Card
  quantity: number
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
 * What the full-screen deck view shows: one section per non-empty zone, in the game's zone
 * order, each split by card type (alphabetical) and sorted by cost then name. Cards missing
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

    const byCategory = new Map<string, DeckViewEntry[]>()
    for (const { cardId, quantity } of deck.zones[zone.id] ?? []) {
      const card = cardsById.get(cardId)
      if (!card || quantity <= 0) continue
      const list = byCategory.get(card.category) ?? []
      list.push({ card, quantity })
      byCategory.set(card.category, list)
    }
    if (byCategory.size === 0) continue

    const groups: DeckViewGroup[] = [...byCategory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, entries]) => ({
        category,
        count: sum(entries),
        entries: entries.sort((a, b) => compareByCostThenName(a.card, b.card)),
      }))
    sections.push({ zoneId: zone.id, label: zone.label, count: groups.reduce((total, g) => total + g.count, 0), groups, chips: [] })
  }

  return sections
}

/** The plain-text list split into its blank-line-separated blocks, so they can be laid out in columns without splitting one. */
export function textBlocks(text: string): string[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trimEnd())
    .filter((block) => block.trim() !== '')
}
