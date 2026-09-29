/**
 * What changes between two decks of the same game, zone by zone: "to turn this deck into that one,
 * add 2 of X and take out 1 of Y". Printings of a card count together (poolKey), so swapping a card
 * for another art of it isn't a change.
 */
import type { Card, Deck, DeckFreeTextEntry, DeckRules } from './types'
import { mergePrintings } from './deckView'
import { poolKey } from './collection'

export interface CardChange {
  /** The card to show (the other deck's printing when it has one, else this deck's). */
  card: Card | null
  /** Card name, or a free-text entry's label (Riftbound runes). */
  name: string
  from: number
  to: number
}

export interface ZoneChanges {
  zoneId: string
  label: string
  changes: CardChange[]
  /** Copies in each deck's zone. */
  fromCount: number
  toCount: number
}

export interface DeckDiff {
  zones: ZoneChanges[]
  /** Copies added / taken out across every zone. */
  added: number
  removed: number
}

function freeText(entries: DeckFreeTextEntry[] | undefined): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries ?? []) out.set(e.label, (out.get(e.label) ?? 0) + e.quantity)
  return out
}

export function compareDecks(from: Pick<Deck, 'zones' | 'freeTextZones'>, to: Pick<Deck, 'zones' | 'freeTextZones'>, rules: DeckRules, cardsById: Map<string, Card>): DeckDiff {
  const zones: ZoneChanges[] = []
  let added = 0
  let removed = 0
  const zoneIds = new Set<string>([...rules.zones.map((z) => z.id), ...Object.keys(from.zones), ...Object.keys(to.zones), ...Object.keys(from.freeTextZones ?? {}), ...Object.keys(to.freeTextZones ?? {})])
  for (const zoneId of zoneIds) {
    const rule = rules.zones.find((z) => z.id === zoneId)
    const label = rule?.label ?? zoneId
    const changes: CardChange[] = []
    let fromCount = 0
    let toCount = 0
    if (rule?.freeText || (!rule && (from.freeTextZones?.[zoneId] || to.freeTextZones?.[zoneId]))) {
      const a = freeText(from.freeTextZones?.[zoneId])
      const b = freeText(to.freeTextZones?.[zoneId])
      for (const name of new Set([...a.keys(), ...b.keys()])) {
        const x = a.get(name) ?? 0
        const y = b.get(name) ?? 0
        fromCount += x
        toCount += y
        if (x !== y) changes.push({ card: null, name, from: x, to: y })
      }
    } else {
      // Same key the app counts copies by (a name, or One Piece's card number), so a new art isn't a change.
      const a = new Map(mergePrintings(from.zones[zoneId] ?? [], cardsById).map((e) => [poolKey(e.card), e]))
      const b = new Map(mergePrintings(to.zones[zoneId] ?? [], cardsById).map((e) => [poolKey(e.card), e]))
      for (const key of new Set([...a.keys(), ...b.keys()])) {
        const x = a.get(key)?.quantity ?? 0
        const y = b.get(key)?.quantity ?? 0
        fromCount += x
        toCount += y
        const card = (b.get(key) ?? a.get(key))!.card
        if (x !== y) changes.push({ card, name: card.name, from: x, to: y })
      }
    }
    if (!changes.length && !fromCount && !toCount) continue
    // Additions first, then removals, biggest change first within each.
    changes.sort((p, q) => Math.sign(q.to - q.from) - Math.sign(p.to - p.from) || Math.abs(q.to - q.from) - Math.abs(p.to - p.from) || p.name.localeCompare(q.name))
    for (const c of changes) {
      if (c.to > c.from) added += c.to - c.from
      else removed += c.from - c.to
    }
    zones.push({ zoneId, label, changes, fromCount, toCount })
  }
  // Keep the game's own zone order.
  const order = rules.zones.map((z) => z.id)
  zones.sort((p, q) => (order.indexOf(p.zoneId) + 1 || 99) - (order.indexOf(q.zoneId) + 1 || 99))
  return { zones, added, removed }
}

/** The changes as plain text ("+2 Lightning Bolt"), zone by zone, for pasting into a chat or notes. */
export function diffText(diff: DeckDiff, zoneName: (label: string) => string = (l) => l): string {
  const blocks: string[] = []
  for (const zone of diff.zones) {
    if (!zone.changes.length) continue
    blocks.push([zoneName(zone.label), ...zone.changes.map((c) => `${c.to > c.from ? '+' : '−'}${Math.abs(c.to - c.from)} ${c.name}`)].join('\n'))
  }
  return blocks.join('\n\n')
}
