import type { Card, Deck, DeckCardEntry, DeckFreeTextEntry, ListWatch, PairingsResult, TraderProfile } from './types'
import type { CommunityList } from './communityLists'
import { deckCodeToCards } from './riftboundDeckCode'
import { matchupsOf } from './pairingsRecord'
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

/** A list as a Riftbound deck (its deck code read against the card data, `index` from codeIndex), or null if the code can't be read. */
export function listDeck(list: CommunityList, index: Map<string, Card>): ListDeck | null {
  try {
    return { list, ...deckCodeToCards(list.deckCode, index) }
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

// ---------- your record against each Legend (Pairings) ----------

export interface VsRecord {
  wins: number
  losses: number
  draws: number
}

const champion = (legendName: string) => legendName.split(/, | - /)[0].trim().toLowerCase()
const titleOf = (legendName: string) => legendName.split(/, | - /).slice(1).join(' ').toLowerCase()
const hasWord = (text: string, word: string) => new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'iu').test(text)

/**
 * Your Pairings results against each Legend: opponents are typed by hand ("kennen", "Kennen OC"), so
 * one counts for a Legend when it names its champion; when two Legends share a champion (Master Yi),
 * the one whose title it also names, else neither.
 */
export function recordsVsLegends(legends: readonly Pick<LegendMeta, 'legendId' | 'legendName'>[], results: readonly PairingsResult[]): Map<string, VsRecord> {
  const out = new Map<string, VsRecord>()
  for (const m of matchupsOf([...results])) {
    const opponent = m.opponent.toLowerCase()
    let matches = legends.filter((l) => hasWord(opponent, champion(l.legendName)))
    // Words of the title that aren't in the champion's name ("Wuju Master" -> "wuju": "master" is Master Yi's own).
    const titleWords = (l: Pick<LegendMeta, 'legendName'>) => titleOf(l.legendName).split(/\s+/).filter((w) => w.length > 3 && !champion(l.legendName).split(/\s+/).includes(w))
    if (matches.length > 1) matches = matches.filter((l) => titleWords(l).some((w) => opponent.includes(w)))
    if (matches.length !== 1) continue
    const r = out.get(matches[0].legendId) ?? { wins: 0, losses: 0, draws: 0 }
    out.set(matches[0].legendId, { wins: r.wins + m.wins, losses: r.losses + m.losses, draws: r.draws + m.draws })
  }
  return out
}

// ---------- watching a list's price ----------

export function sanitizeListWatches(raw: unknown): Record<string, ListWatch> {
  const out: Record<string, ListWatch> = {}
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [id, w] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (w == null || typeof w !== 'object') continue
    const { name, deckCode, target, hit } = w as Record<string, unknown>
    if (typeof name !== 'string' || typeof deckCode !== 'string' || !/^[A-Z2-7]+$/.test(deckCode)) continue
    if (typeof target !== 'number' || !Number.isFinite(target) || target < 0) continue
    out[id] = { name: name.slice(0, 200), deckCode, target, ...(hit === true ? { hit: true } : {}) }
  }
  return out
}

export interface ListWatchHit {
  watch: ListWatch
  /** USD to finish it now. */
  cost: number
}

/**
 * Checks each watched list's cost to finish (with what you own now) against its target. Returns the
 * watches that just went off and the updated watches (null when nothing changed); like price alerts,
 * one re-arms when the cost climbs back above its target.
 */
export function checkListWatches(
  watches: Record<string, ListWatch> | undefined,
  index: Map<string, Card>,
  cardsById: Map<string, Card>,
  cards: readonly Card[],
  owned: Map<string, number>,
): { hits: ListWatchHit[]; next: Record<string, ListWatch> | null } {
  if (!watches || !cardsById.size) return { hits: [], next: null }
  const hits: ListWatchHit[] = []
  const next: Record<string, ListWatch> = {}
  let changed = false
  for (const [id, watch] of Object.entries(watches)) {
    let cost: number
    try {
      cost = listOwnership(deckCodeToCards(watch.deckCode, index), cardsById, cards, owned).missingCost
    } catch {
      next[id] = watch
      continue
    }
    const below = cost <= watch.target
    if (below && !watch.hit) {
      hits.push({ watch, cost })
      next[id] = { ...watch, hit: true }
      changed = true
    } else if (!below && watch.hit) {
      next[id] = { name: watch.name, deckCode: watch.deckCode, target: watch.target }
      changed = true
    } else next[id] = watch
  }
  return { hits, next: changed ? next : null }
}

// ---------- the missing cards on other people's trade lists ----------

export interface TradeOffer {
  /** The card as the list uses it. */
  card: Card
  missing: number
  /** Who has it marked for trade (display names). */
  traders: string[]
}

/** A trade listing's card name as the copy limit counts it ("Gust (Alternate Art)" -> "gust"). */
const listingKey = (name: string) => normalizeName(name.replace(/\s*\([^)]*\)\s*$/, ''))

/** Which of a list's missing cards other traders have marked for trade (any printing), most traders first. */
export function tradeOffersFor(deck: ListCards, cardsById: Map<string, Card>, owned: Map<string, number>, traders: readonly TraderProfile[]): { offers: TradeOffer[]; missingCards: number } {
  const missing = missingForDeck(deck as Deck, cardsById, owned)
  const byName = new Map<string, Set<string>>()
  for (const trader of traders) {
    for (const listing of trader.collection) {
      if (listing.gameId !== 'riftbound' || !listing.forTrade || listing.quantity <= 0) continue
      const key = listingKey(listing.cardName)
      const names = byName.get(key) ?? byName.set(key, new Set()).get(key)!
      names.add(trader.displayName || '?')
    }
  }
  const offers: TradeOffer[] = []
  for (const m of missing) {
    const traders = byName.get(listingKey(getAdapter('riftbound').copyName?.(m.card) ?? m.card.name))
    if (traders?.size) offers.push({ card: m.card, missing: m.quantity, traders: [...traders].sort() })
  }
  return { offers: offers.sort((a, b) => b.traders.length - a.traders.length || a.card.name.localeCompare(b.card.name)), missingCards: missing.length }
}

// ---------- a deck against its Legend's lists ----------

export interface MetaComparison {
  /** How many of the Legend's lists this compares with. */
  total: number
  /** Cards at least half the lists play that the deck doesn't, most played first. */
  missing: CardPlay[]
  /** Cards the deck plays that at most a tenth of the lists do (none, often). */
  unusual: { card: Card; lists: number }[]
}

/** Every card the deck plays outside its Legend zone, by play key. */
function deckPlayKeys(deck: ListCards, cardsById: Map<string, Card>): Map<string, Card> {
  const out = new Map<string, Card>()
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    if (zoneId === 'legend') continue
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      if (card && quantity > 0 && !out.has(playKey(card))) out.set(playKey(card), card)
    }
  }
  return out
}

/** How a deck differs from the recent lists with its Legend: the staples it skips and its unusual picks (sideboards aside). */
export function compareToMeta(deck: ListCards, legendDecks: readonly ListCards[], cardsById: Map<string, Card>): MetaComparison {
  const total = legendDecks.length
  const mine = deckPlayKeys(deck, cardsById)
  const plays = cardPlayRates(legendDecks, cardsById).filter((p) => p.zoneId !== 'sideboard')
  const listsByKey = new Map<string, number>()
  for (const p of plays) listsByKey.set(playKey(p.card), Math.max(listsByKey.get(playKey(p.card)) ?? 0, p.lists))
  const missing = plays.filter((p) => p.lists * 2 >= total && !mine.has(playKey(p.card)))
  const unusual = [...mine]
    .map(([key, card]) => ({ card, lists: listsByKey.get(key) ?? 0 }))
    .filter((u) => u.lists * 10 <= total && u.card.category !== 'Rune')
    .sort((a, b) => a.lists - b.lists || a.card.name.localeCompare(b.card.name))
  return { total, missing, unusual }
}

// ---------- which cards are gaining or losing play ----------

export interface CardTrend {
  card: Card
  /** Share of the recent lists playing it, and of the earlier ones (0-1). */
  recent: number
  earlier: number
}

/** The window the trends compare: the last two weeks of a Legend's lists against everything before. */
export const TREND_DAYS = 14
const MIN_TREND_LISTS = 5

/**
 * Cards whose share of a Legend's lists moved the most between the last two weeks (counted back from
 * its newest list) and before, `limit` rising and `limit` falling. Null when either side has too few
 * lists to say.
 */
export function cardTrends(decks: readonly ListDeck[], cardsById: Map<string, Card>, limit = 5): { rising: CardTrend[]; falling: CardTrend[] } | null {
  const dated = decks.filter((d) => d.list.date)
  const newest = Math.max(...dated.map((d) => new Date(d.list.date!).getTime()))
  if (!Number.isFinite(newest)) return null
  const cut = newest - TREND_DAYS * 24 * 60 * 60 * 1000
  const recent = dated.filter((d) => new Date(d.list.date!).getTime() > cut)
  const earlier = dated.filter((d) => new Date(d.list.date!).getTime() <= cut)
  if (recent.length < MIN_TREND_LISTS || earlier.length < MIN_TREND_LISTS) return null
  const share = (group: readonly ListDeck[]) => {
    const out = new Map<string, { card: Card; n: number }>()
    for (const p of cardPlayRates(group, cardsById)) {
      if (p.zoneId === 'sideboard') continue
      const key = playKey(p.card)
      const seen = out.get(key)
      out.set(key, { card: seen?.card ?? p.card, n: Math.max(seen?.n ?? 0, p.lists) })
    }
    return out
  }
  const now = share(recent)
  const before = share(earlier)
  const trends: CardTrend[] = []
  for (const key of new Set([...now.keys(), ...before.keys()])) {
    const card = now.get(key)?.card ?? before.get(key)!.card
    trends.push({ card, recent: (now.get(key)?.n ?? 0) / recent.length, earlier: (before.get(key)?.n ?? 0) / earlier.length })
  }
  const delta = (t: CardTrend) => t.recent - t.earlier
  const MIN_CHANGE = 0.15
  return {
    rising: trends.filter((t) => delta(t) >= MIN_CHANGE).sort((a, b) => delta(b) - delta(a)).slice(0, limit),
    falling: trends.filter((t) => -delta(t) >= MIN_CHANGE).sort((a, b) => delta(a) - delta(b)).slice(0, limit),
  }
}

// ---------- new lists for the Legends you opted into ----------

export interface ListAlerts {
  /** The Legends (by code) you asked to hear about. */
  legends: string[]
  /** Events already seen, so only new ones are announced. */
  seenEvents: string[]
}

export function sanitizeListAlerts(raw: unknown): ListAlerts | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const strings = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(-max) : [])
  return { legends: strings(r.legends, 100), seenEvents: strings(r.seenEvents, 500) }
}

export interface NewLists {
  legendId: string
  legendName: string
  count: number
  eventNames: string[]
}

/**
 * The lists with your opted-in Legends from events not seen before, per Legend, and the alerts with
 * every current event marked seen (null when nothing changed).
 */
export function newListsFor(alerts: ListAlerts | undefined, lists: readonly CommunityList[]): { found: NewLists[]; next: ListAlerts | null } {
  if (!alerts?.legends.length) return { found: [], next: null }
  const seen = new Set(alerts.seenEvents)
  const wanted = new Set(alerts.legends)
  const found = new Map<string, NewLists>()
  for (const l of lists) {
    if (!l.eventId || seen.has(l.eventId) || !wanted.has(l.legendId)) continue
    const f = found.get(l.legendId) ?? found.set(l.legendId, { legendId: l.legendId, legendName: l.legendName, count: 0, eventNames: [] }).get(l.legendId)!
    f.count++
    if (!f.eventNames.includes(l.eventName)) f.eventNames.push(l.eventName)
  }
  const events = [...new Set(lists.map((l) => l.eventId).filter(Boolean))]
  const fresh = events.filter((e) => !seen.has(e))
  return { found: [...found.values()], next: fresh.length ? { legends: alerts.legends, seenEvents: [...alerts.seenEvents, ...fresh].slice(-500) } : null }
}
