import type { Card, GameId } from './types'

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
