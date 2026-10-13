import type { Card, Deck, DeckCardEntry, DeckFreeTextEntry } from './types'
import type { CommunityList } from './communityLists'
import { deckCodeToText } from './riftboundDeckCode'
import { parseDecklistText } from './importDeck'
import { getAdapter } from './games/registry'
import { missingForDeck, neededByPool, normalizeName } from './collection'
import { buyList } from './buyList'

/**
 * What the community lists add up to: each list as a deck, how much of it you own, how often each
 * Legend places, which cards its lists play, and the cards most of them agree on (its "core").
 */

export type ListCards = Pick<Deck, 'zones' | 'freeTextZones'>

export interface ListDeck extends ListCards {
  list: CommunityList
}

/** A list as a Riftbound deck (its deck code read against the card data), or null if the code can't be read. */
export function listDeck(list: CommunityList, cardsById: Map<string, Card>): ListDeck | null {
  try {
    const parsed = parseDecklistText(deckCodeToText(list.deckCode, cardsById.values()), getAdapter('riftbound'), cardsById, 'constructed')
    return { list, zones: parsed.zones, freeTextZones: parsed.freeTextZones }
  } catch {
    return null
  }
}

export interface ListOwnership {
  /** Copies the list uses (runes aside: they're a count by domain, not cards you collect). */
  needed: number
  owned: number
  /** USD for the copies you don't own, each at its cheapest printing. */
  missingCost: number
  unpricedCopies: number
}

export function listOwnership(deck: ListCards, cardsById: Map<string, Card>, cards: readonly Card[], owned: Map<string, number>): ListOwnership {
  const asDeck = deck as Deck
  let needed = 0
  for (const need of neededByPool(asDeck, cardsById).values()) needed += need.needed
  const missing = missingForDeck(asDeck, cardsById, owned).reduce((n, m) => n + m.quantity, 0)
  const buy = buyList(asDeck, cardsById, cards, owned, 'cheapest')
  return { needed, owned: needed - missing, missingCost: buy.total, unpricedCopies: buy.unpricedCopies }
}

export interface LegendMeta {
  legendId: string
  legendName: string
  lists: number
  wins: number
  /** Finishes in the top 4. */
  top4: number
}

/** Each Legend's finishes among the lists, most lists first. */
export function legendMeta(lists: readonly CommunityList[]): LegendMeta[] {
  const byLegend = new Map<string, LegendMeta>()
  for (const l of lists) {
    const m = byLegend.get(l.legendId) ?? byLegend.set(l.legendId, { legendId: l.legendId, legendName: l.legendName, lists: 0, wins: 0, top4: 0 }).get(l.legendId)!
    m.lists++
    if (l.rank === 1) m.wins++
    if (l.rank != null && l.rank <= 4) m.top4++
  }
  return [...byLegend.values()].sort((a, b) => b.lists - a.lists || b.wins - a.wins || a.legendName.localeCompare(b.legendName))
}

export interface CardPlay {
  /** The printing most lists use. */
  card: Card
  zoneId: string
  /** How many of the lists play it in this zone. */
  lists: number
  /** The number of copies those lists play most often. */
  usualCopies: number
}

/** Which card a printing is, for counting plays: the name the copy limit goes by (an alternate art is its card). */
const playKey = (card: Card) => normalizeName(getAdapter('riftbound').copyName?.(card) ?? card.name)

/** A zone's copies per card (every printing of a card together), with the printing used most. */
function copiesByPool(entries: readonly DeckCardEntry[], cardsById: Map<string, Card>): Map<string, { cardId: string; copies: number }> {
  const out = new Map<string, { cardId: string; copies: number }>()
  for (const { cardId, quantity } of entries) {
    const card = cardsById.get(cardId)
    if (!card || quantity <= 0) continue
    const key = playKey(card)
    const seen = out.get(key)
    out.set(key, { cardId: seen && seen.copies >= quantity ? seen.cardId : cardId, copies: (seen?.copies ?? 0) + quantity })
  }
  return out
}

/** The value seen most often; a tie goes to the first seen, or with `tieBreak`, its pick. */
const mostCommon = <T,>(values: readonly T[], tieBreak?: (a: T, b: T) => number): T => {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || (tieBreak?.(a[0], b[0]) ?? 0))[0][0]
}

/** How many of the lists play each card, by zone (the Legend aside), most played first. */
export function cardPlayRates(decks: readonly ListCards[], cardsById: Map<string, Card>): CardPlay[] {
  const plays = new Map<string, { zoneId: string; cardIds: string[]; copies: number[] }>()
  for (const deck of decks) {
    for (const [zoneId, entries] of Object.entries(deck.zones)) {
      if (zoneId === 'legend') continue
      for (const [key, { cardId, copies }] of copiesByPool(entries, cardsById)) {
        const p = plays.get(`${zoneId}|${key}`) ?? plays.set(`${zoneId}|${key}`, { zoneId, cardIds: [], copies: [] }).get(`${zoneId}|${key}`)!
        p.cardIds.push(cardId)
        p.copies.push(copies)
      }
    }
  }
  const out: CardPlay[] = []
  for (const p of plays.values()) {
    const card = cardsById.get(mostCommon(p.cardIds))
    if (card) out.push({ card, zoneId: p.zoneId, lists: p.cardIds.length, usualCopies: mostCommon(p.copies, (a, b) => b - a) })
  }
  return out.sort((a, b) => b.lists - a.lists || b.usualCopies - a.usualCopies || a.card.name.localeCompare(b.card.name))
}

/** Splits `total` over the domains in proportion to `weights`, whole numbers that add up to it. */
function apportion(weights: Map<string, number>, total: number): DeckFreeTextEntry[] {
  const sum = [...weights.values()].reduce((a, b) => a + b, 0)
  if (sum <= 0) return []
  const shares = [...weights].map(([label, w]) => ({ label, exact: (w / sum) * total }))
  const out = shares.map((s) => ({ label: s.label, quantity: Math.floor(s.exact) }))
  let left = total - out.reduce((n, e) => n + e.quantity, 0)
  for (const i of shares.map((s, i) => ({ i, r: s.exact - Math.floor(s.exact) })).sort((a, b) => b.r - a.r).map((x) => x.i)) {
    if (left-- <= 0) break
    out[i].quantity++
  }
  return out.filter((e) => e.quantity > 0)
}

/**
 * The cards at least half the lists agree on: the most played Legend, every Main Deck card and
 * Battlefield in half the lists or more at its usual number of copies, and the Rune Deck split the
 * way the lists split it on average. Usually short of a full deck - the rest is yours to pick.
 */
export function coreDeck(decks: readonly ListCards[], cardsById: Map<string, Card>): ListCards {
  const zones: Record<string, DeckCardEntry[]> = {}
  const legends = decks.flatMap((d) => d.zones.legend ?? []).map((e) => e.cardId)
  if (legends.length) zones.legend = [{ cardId: mostCommon(legends), quantity: 1 }]
  for (const play of cardPlayRates(decks, cardsById)) {
    if (play.zoneId === 'sideboard' || play.lists * 2 < decks.length) continue
    ;(zones[play.zoneId] ??= []).push({ cardId: play.card.id, quantity: play.usualCopies })
  }
  const runeTotals = new Map<string, number>()
  let runeDecks = 0
  for (const deck of decks) {
    const runes = deck.freeTextZones.runes ?? []
    if (runes.length) runeDecks++
    for (const { label, quantity } of runes) runeTotals.set(label, (runeTotals.get(label) ?? 0) + quantity)
  }
  const runeCount = runeDecks ? Math.round([...runeTotals.values()].reduce((a, b) => a + b, 0) / runeDecks) : 0
  return { zones, freeTextZones: runeCount ? { runes: apportion(runeTotals, runeCount) } : {} }
}
