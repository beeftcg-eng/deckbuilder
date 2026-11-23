import type { Card, GameId } from './types'
import { matchesSearch, matchRank } from './cardSearch'

/**
 * Tier lists: rank a game's cards into rows (S, A, B…) and save the result as a picture to share
 * (lib/tierListImage.ts). Kept in settings with the other records (settingsItems.ts), so they're in
 * backups; they stay on this device (not synced). Every card sits in at most one place: a tier, or
 * the unranked pool at the bottom.
 */

export interface Tier {
  id: string
  label: string
  /** A CSS hex color, "#rrggbb". */
  color: string
  cardIds: string[]
}

export interface TierList {
  id: string
  gameId: GameId
  name: string
  tiers: Tier[]
  /** Cards added but not ranked yet. */
  pool: string[]
  createdAt: string
  updatedAt: string
}

/** Where a card can be: a tier's id, or the pool. */
export type TierSpot = string | 'pool'

export const POOL: TierSpot = 'pool'

/** The classic tier colors, top to bottom; new tiers past these repeat the last. */
export const TIER_COLORS = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#7f7fff', '#ff7fff', '#bf7fbf', '#cfcfcf']

const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D']
/** Enough for any sensible list; also what the sanitizer allows. */
export const MAX_TIERS = 20
export const MAX_CARDS = 1000

const newId = () => crypto.randomUUID()

export function newTier(label: string, color: string): Tier {
  return { id: newId(), label, color, cardIds: [] }
}

export function newTierList(gameId: GameId, name: string, now = new Date()): TierList {
  const at = now.toISOString()
  return { id: newId(), gameId, name, tiers: DEFAULT_LABELS.map((label, i) => newTier(label, TIER_COLORS[i])), pool: [], createdAt: at, updatedAt: at }
}

/** Every card in the list, tiers first, then the pool. */
export function allCardIds(list: TierList): string[] {
  return [...list.tiers.flatMap((t) => t.cardIds), ...list.pool]
}

export function cardCount(list: TierList): number {
  return list.tiers.reduce((n, t) => n + t.cardIds.length, list.pool.length)
}

export function rankedCount(list: TierList): number {
  return list.tiers.reduce((n, t) => n + t.cardIds.length, 0)
}

/** Where a card is, or null if it isn't in the list. */
export function spotOf(list: TierList, cardId: string): TierSpot | null {
  if (list.pool.includes(cardId)) return POOL
  return list.tiers.find((t) => t.cardIds.includes(cardId))?.id ?? null
}

function without(list: TierList, cardId: string): TierList {
  return { ...list, pool: list.pool.filter((id) => id !== cardId), tiers: list.tiers.map((t) => (t.cardIds.includes(cardId) ? { ...t, cardIds: t.cardIds.filter((id) => id !== cardId) } : t)) }
}

/** Adds cards to the end of the pool; ones already in the list (anywhere) are skipped, and the list stops at MAX_CARDS. */
export function addCards(list: TierList, cardIds: readonly string[]): TierList {
  const present = new Set(allCardIds(list))
  const room = MAX_CARDS - present.size
  const added: string[] = []
  for (const id of cardIds) {
    if (added.length >= room) break
    if (present.has(id)) continue
    present.add(id)
    added.push(id)
  }
  return added.length ? { ...list, pool: [...list.pool, ...added] } : list
}

export function removeCard(list: TierList, cardId: string): TierList {
  return without(list, cardId)
}

/**
 * Moves a card to `to` (a tier or the pool), before the card `beforeId` there, or at the end when
 * that's missing. A card not in the list yet is added this way too.
 */
export function moveCard(list: TierList, cardId: string, to: TierSpot, beforeId?: string | null): TierList {
  if (beforeId === cardId) return list
  if (to !== POOL && !list.tiers.some((t) => t.id === to)) return list
  const next = without(list, cardId)
  const insert = (ids: string[]) => {
    const at = beforeId ? ids.indexOf(beforeId) : -1
    return at < 0 ? [...ids, cardId] : [...ids.slice(0, at), cardId, ...ids.slice(at)]
  }
  if (to === POOL) return { ...next, pool: insert(next.pool) }
  return { ...next, tiers: next.tiers.map((t) => (t.id === to ? { ...t, cardIds: insert(t.cardIds) } : t)) }
}

/** A new tier at the bottom, labelled with the next letter after the last default one when it can be. */
export function addTier(list: TierList): TierList {
  if (list.tiers.length >= MAX_TIERS) return list
  const used = new Set(list.tiers.map((t) => t.label))
  const label = ['S', 'A', 'B', 'C', 'D', 'E', 'F'].find((l) => !used.has(l)) ?? `${list.tiers.length + 1}`
  const color = TIER_COLORS[Math.min(list.tiers.length, TIER_COLORS.length - 1)]
  return { ...list, tiers: [...list.tiers, newTier(label, color)] }
}

/** Removes a tier; its cards go back to the pool, so nothing is lost. */
export function removeTier(list: TierList, tierId: string): TierList {
  const tier = list.tiers.find((t) => t.id === tierId)
  if (!tier) return list
  return { ...list, tiers: list.tiers.filter((t) => t.id !== tierId), pool: [...tier.cardIds, ...list.pool] }
}

export function updateTier(list: TierList, tierId: string, patch: Partial<Pick<Tier, 'label' | 'color'>>): TierList {
  return { ...list, tiers: list.tiers.map((t) => (t.id === tierId ? { ...t, ...patch } : t)) }
}

/** Moves a tier up (-1) or down (+1). */
export function shiftTier(list: TierList, tierId: string, delta: -1 | 1): TierList {
  const from = list.tiers.findIndex((t) => t.id === tierId)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.tiers.length) return list
  const tiers = [...list.tiers]
  ;[tiers[from], tiers[to]] = [tiers[to], tiers[from]]
  return { ...list, tiers }
}

/** Every ranked card back to the pool (in tier order), keeping the tiers themselves. */
export function resetRanks(list: TierList): TierList {
  return { ...list, tiers: list.tiers.map((t) => ({ ...t, cardIds: [] })), pool: [...list.tiers.flatMap((t) => t.cardIds), ...list.pool] }
}

export function duplicateTierList(list: TierList, name: string, now = new Date()): TierList {
  const at = now.toISOString()
  return { ...structuredClone(list), id: newId(), name, tiers: list.tiers.map((t) => ({ ...t, id: newId(), cardIds: [...t.cardIds] })), createdAt: at, updatedAt: at }
}

/** The list as text, one line per tier: "S: Card A, Card B". Cards no longer in the data show by id. */
export function tierListText(list: TierList, lookup: (cardId: string) => Card | undefined): string {
  const name = (id: string) => lookup(id)?.name ?? id
  const lines = [list.name, '']
  for (const tier of list.tiers) lines.push(`${tier.label || '—'}: ${tier.cardIds.map(name).join(', ')}`)
  return lines.join('\n').trimEnd()
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

function cleanIds(raw: unknown, seen: Set<string>): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const id of raw) {
    if (typeof id !== 'string' || !id || id.length > 200 || seen.has(id) || seen.size >= MAX_CARDS) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Only well-formed lists get through (a stale or hand-edited file); a card listed twice keeps its first place. */
export function sanitizeTierLists(raw: unknown, gameIds: readonly string[]): TierList[] {
  if (!Array.isArray(raw)) return []
  const lists: TierList[] = []
  for (const item of raw.slice(0, 500)) {
    if (!isObject(item) || typeof item.id !== 'string' || !item.id || typeof item.gameId !== 'string' || !gameIds.includes(item.gameId)) continue
    const seen = new Set<string>()
    const tiers: Tier[] = []
    for (const tier of Array.isArray(item.tiers) ? item.tiers.slice(0, MAX_TIERS) : []) {
      if (!isObject(tier) || typeof tier.id !== 'string' || !tier.id) continue
      tiers.push({ id: tier.id, label: typeof tier.label === 'string' ? tier.label.slice(0, 40) : '', color: isColor(tier.color) ? tier.color : TIER_COLORS[0], cardIds: cleanIds(tier.cardIds, seen) })
    }
    const now = new Date().toISOString()
    lists.push({
      id: item.id,
      gameId: item.gameId as GameId,
      name: typeof item.name === 'string' ? item.name.slice(0, 200) : '',
      tiers,
      pool: cleanIds(item.pool, seen),
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : now,
    })
  }
  return lists
}

/** A game's sets with their cards, newest set first (by release date, else name). */
export function setsOf(cards: readonly Card[]): { id: string; name: string; cards: Card[] }[] {
  const sets = new Map<string, { id: string; name: string; date: string; cards: Card[] }>()
  for (const card of cards) {
    const set = sets.get(card.setId) ?? { id: card.setId, name: card.setName || card.setId, date: '', cards: [] }
    const date = card.setReleased ?? card.released ?? ''
    if (date > set.date) set.date = date
    set.cards.push(card)
    sets.set(card.setId, set)
  }
  return [...sets.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
}

/** A Type filter choice: a card type ("c:Legend") or a subtype ("s:Champion"). */
export interface TypeOption {
  value: string
  label: string
  count: number
}

/** Past this many different subtypes (Magic's creature types), the Type filter leaves them out. */
const MAX_SUBTYPE_OPTIONS = 40

/** The Type filter's choices for a game's cards, most common first: card types, then subtypes when there are few enough. */
export function typeOptions(cards: readonly Card[]): { types: TypeOption[]; subtypes: TypeOption[] } {
  const types = new Map<string, number>()
  const subtypes = new Map<string, number>()
  for (const card of cards) {
    if (card.category) types.set(card.category, (types.get(card.category) ?? 0) + 1)
    for (const sub of card.subtypes) if (sub) subtypes.set(sub, (subtypes.get(sub) ?? 0) + 1)
  }
  const list = (counts: Map<string, number>, prefix: string) =>
    [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, count]) => ({ value: `${prefix}:${label}`, label, count }))
  return { types: list(types, 'c'), subtypes: subtypes.size <= MAX_SUBTYPE_OPTIONS ? list(subtypes, 's') : [] }
}

export interface CardPick {
  /** Search text; used from 2 characters. */
  query: string
  /** A set id, or '' for every set. */
  setId: string
  /** A TypeOption value, or '' for every type. */
  type: string
  /** Keep one printing of each card name (the first in the order below). */
  onePrinting: boolean
}

/** Whether the pick narrows anything down: an empty one shows no cards rather than the whole game. */
export function isPicking(pick: CardPick): boolean {
  return pick.query.trim().length >= 2 || !!pick.setId || !!pick.type
}

/**
 * The cards a search and filters pick, for adding to a tier list. With search text, best matches
 * first; otherwise set by set (newest first, or the one set's collector order).
 */
export function pickCards(cards: readonly Card[], pick: CardPick): Card[] {
  if (!isPicking(pick)) return []
  const q = pick.query.trim().toLowerCase()
  const [kind, typeName] = pick.type ? [pick.type.slice(0, 1), pick.type.slice(2)] : ['', '']
  const matched = cards.filter(
    (c) =>
      (!pick.setId || c.setId === pick.setId) &&
      (!kind || (kind === 'c' ? c.category === typeName : c.subtypes.includes(typeName))) &&
      (q.length < 2 || matchesSearch(c, q)),
  )
  const setRank = new Map(setsOf(cards).map((set, i) => [set.id, i]))
  const byNumber = (a: Card, b: Card) => a.number.localeCompare(b.number, undefined, { numeric: true })
  matched.sort(
    q.length >= 2
      ? (a, b) => matchRank(a, q) - matchRank(b, q) || a.name.localeCompare(b.name) || (setRank.get(a.setId) ?? 0) - (setRank.get(b.setId) ?? 0) || byNumber(a, b)
      : (a, b) => (setRank.get(a.setId) ?? 0) - (setRank.get(b.setId) ?? 0) || byNumber(a, b),
  )
  if (!pick.onePrinting) return matched
  const seen = new Set<string>()
  return matched.filter((c) => !seen.has(c.name) && (seen.add(c.name), true))
}
