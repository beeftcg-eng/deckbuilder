import type { Card, CardLegalityStatus, Format, GameId } from './types'

/**
 * Ban lists that update themselves. The daily phone-app deploy (scripts/build-ban-lists.ts) publishes
 * banlists.json next to the app, and every app reads it at launch:
 *
 * - One Piece and Riftbound: the lists kept in this repo (each adapter's defaultFormats). Updating
 *   them there reaches everyone within a day, with no app release. The published list is merged into
 *   the saved one (mergePublishedFormat), so a card you banned or unbanned yourself in the ban list
 *   editor stays that way.
 * - Yu-Gi-Oh!: the Forbidden / Limited / Semi-Limited lists from YGOPRODeck, laid over the card data
 *   (applyYgoBanLists), so a new list counts without re-downloading every card.
 *
 * Either way, a list that changed is shown once (BanListUpdate), with the decks it makes illegal.
 */
export const BAN_LISTS_URL = 'https://beeftcg-eng.github.io/deckbuilder/banlists.json'

/** The games whose lists are kept in this repo and merged into the saved formats. */
export const REPO_LIST_GAMES = ['onepiece', 'riftbound'] as const satisfies readonly GameId[]

export type BanStatus = Exclude<CardLegalityStatus, 'legal' | 'not_legal'>
const BAN_STATUSES: readonly string[] = ['banned', 'restricted', 'semi-restricted'] satisfies BanStatus[]
const isBanStatus = (v: unknown): v is BanStatus => typeof v === 'string' && BAN_STATUSES.includes(v)

/** One format's list as published for a game kept in this repo. */
export interface PublishedFormat {
  bannedCardIds: string[]
  restrictedCardIds: string[]
  bannedPairs: [string, string][]
  illegalSetIds?: string[]
  nextRotation?: { date?: string; leavingSetIds: string[] }
}

/** One Yu-Gi-Oh! format's list: passcode -> status, and the names to show them by. */
export interface YgoBanList {
  cards: Record<string, BanStatus>
  names: Record<string, string>
}

export interface BanListsFile {
  updatedAt: string
  formats: Partial<Record<GameId, Record<string, PublishedFormat>>>
  yugioh?: Record<string, YgoBanList>
}

/** The last Yu-Gi-Oh! list applied on this device (settings.banListsSeen, keyed `yugioh:<format>`). */
export interface BanSnapshot {
  updatedAt: string
  cards: Record<string, BanStatus>
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string')
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function readPublishedFormat(raw: unknown): PublishedFormat | null {
  if (!isRecord(raw) || !isStringArray(raw.bannedCardIds) || !isStringArray(raw.restrictedCardIds) || !Array.isArray(raw.bannedPairs)) return null
  const pairs = raw.bannedPairs.filter((p): p is [string, string] => isStringArray(p) && p.length === 2)
  const rotation = isRecord(raw.nextRotation) && isStringArray(raw.nextRotation.leavingSetIds) ? raw.nextRotation : null
  return {
    bannedCardIds: raw.bannedCardIds,
    restrictedCardIds: raw.restrictedCardIds,
    bannedPairs: pairs,
    ...(isStringArray(raw.illegalSetIds) ? { illegalSetIds: raw.illegalSetIds } : {}),
    ...(rotation
      ? { nextRotation: { ...(typeof rotation.date === 'string' ? { date: rotation.date } : {}), leavingSetIds: rotation.leavingSetIds as string[] } }
      : {}),
  }
}

function readStatusMap(raw: unknown): Record<string, BanStatus> | null {
  if (!isRecord(raw)) return null
  const out: Record<string, BanStatus> = {}
  for (const [key, status] of Object.entries(raw)) if (isBanStatus(status)) out[key] = status
  return out
}

/** The published file, if it's one. Anything malformed is left out rather than failing the rest. */
export function readBanListsFile(raw: unknown): BanListsFile | null {
  if (!isRecord(raw) || typeof raw.updatedAt !== 'string') return null
  const formats: BanListsFile['formats'] = {}
  if (isRecord(raw.formats)) {
    for (const gameId of REPO_LIST_GAMES) {
      const game = raw.formats[gameId]
      if (!isRecord(game)) continue
      const out: Record<string, PublishedFormat> = {}
      for (const [formatId, f] of Object.entries(game)) {
        const read = readPublishedFormat(f)
        if (read) out[formatId] = read
      }
      formats[gameId] = out
    }
  }
  let yugioh: BanListsFile['yugioh']
  if (isRecord(raw.yugioh)) {
    yugioh = {}
    for (const [formatId, list] of Object.entries(raw.yugioh)) {
      if (!isRecord(list)) continue
      const cards = readStatusMap(list.cards)
      if (!cards) continue
      const names: Record<string, string> = {}
      if (isRecord(list.names)) for (const [k, v] of Object.entries(list.names)) if (typeof v === 'string') names[k] = v
      yugioh[formatId] = { cards, names }
    }
  }
  return { updatedAt: raw.updatedAt, formats, ...(yugioh ? { yugioh } : {}) }
}

/** Never throws: offline or no file just means the lists stay as they are. */
export async function loadBanLists(): Promise<BanListsFile | null> {
  try {
    const res = await fetch(BAN_LISTS_URL, { cache: 'no-store' })
    return res.ok ? readBanListsFile(await res.json()) : null
  } catch {
    return null
  }
}

/** What gets published for a game kept in this repo: each format's lists, as shipped. */
export function publishedFormatOf(format: Format): PublishedFormat {
  return {
    bannedCardIds: format.bannedCardIds,
    restrictedCardIds: format.restrictedCardIds,
    bannedPairs: format.bannedPairs,
    ...(format.illegalSetIds ? { illegalSetIds: format.illegalSetIds } : {}),
    ...(format.nextRotation ? { nextRotation: format.nextRotation } : {}),
  }
}

const pairKey = ([a, b]: [string, string]) => [a, b].sort().join('|')

/**
 * base -> local is what you changed yourself; base -> published is what changed officially. The
 * result is the published list with your own additions and removals still applied.
 */
function merge3<T>(base: readonly T[], local: readonly T[], published: readonly T[], key: (x: T) => string = String): T[] {
  const baseKeys = new Set(base.map(key))
  const localKeys = new Set(local.map(key))
  const removed = new Set(base.filter((x) => !localKeys.has(key(x))).map(key))
  const added = local.filter((x) => !baseKeys.has(key(x)))
  const out = new Map<string, T>()
  for (const x of published) if (!removed.has(key(x))) out.set(key(x), x)
  for (const x of added) out.set(key(x), x)
  return [...out.values()]
}

const sameKeys = <T>(a: readonly T[] | undefined, b: readonly T[] | undefined, key: (x: T) => string = String) =>
  JSON.stringify((a ?? []).map(key).sort()) === JSON.stringify((b ?? []).map(key).sort())

const sameRotation = (a: Format['nextRotation'], b: Format['nextRotation']) =>
  (a?.date ?? '') === (b?.date ?? '') && sameKeys(a?.leavingSetIds, b?.leavingSetIds)

/**
 * The saved format with a newly published list merged in, or null when nothing changed. The format
 * keeps the list it was merged from (Format.published), so the next merge can tell your own edits
 * from official ones. The first time there's no such record: the saved list is from whenever the app
 * was installed (they never updated themselves before), so the published one replaces it, and the
 * update notice shows exactly what changed.
 */
export function mergePublishedFormat(local: Format, published: PublishedFormat): Format | null {
  const base: PublishedFormat = local.published ?? publishedFormatOf(local)
  if (local.published && JSON.stringify(local.published) === JSON.stringify(published)) return null
  const bannedCardIds = merge3(base.bannedCardIds, local.bannedCardIds, published.bannedCardIds)
  const restrictedCardIds = merge3(base.restrictedCardIds, local.restrictedCardIds, published.restrictedCardIds)
  const bannedPairs = merge3(base.bannedPairs, local.bannedPairs, published.bannedPairs, pairKey)
  const illegalSetIds =
    published.illegalSetIds || local.illegalSetIds ? merge3(base.illegalSetIds ?? [], local.illegalSetIds ?? [], published.illegalSetIds ?? []) : undefined
  // A rotation date you typed yourself stays; one that matched the last published list follows the new one.
  const nextRotation = sameRotation(local.nextRotation, base.nextRotation) ? published.nextRotation : local.nextRotation
  const { nextRotation: _drop, illegalSetIds: _dropSets, ...rest } = local
  return {
    ...rest,
    bannedCardIds,
    restrictedCardIds,
    bannedPairs,
    ...(illegalSetIds ? { illegalSetIds } : {}),
    ...(nextRotation ? { nextRotation } : {}),
    published,
  }
}

/** A format's card list as status by key (`${gameId}:${sourceId}`), for comparing before and after. */
export function formatStatuses(format: Format): Record<string, BanStatus> {
  const out: Record<string, BanStatus> = {}
  for (const key of format.restrictedCardIds) out[key] = 'restricted'
  for (const key of format.bannedCardIds) out[key] = 'banned'
  return out
}

export interface BanChange {
  key: string
  name: string
  /** 'legal' when it wasn't on the list. */
  from: BanStatus | 'legal'
  to: BanStatus | 'legal'
}

export interface BanListUpdate {
  gameId: GameId
  formatId: string
  formatLabel: string
  changes: BanChange[]
  pairsAdded: [string, string][]
  pairsRemoved: [string, string][]
  /** Sets that became illegal / legal (One Piece's rotation). */
  setsRotatedOut: string[]
  setsBack: string[]
  /** Your decks in this format that were legal and aren't any more. */
  decks: string[]
}

const SEVERITY: Record<BanStatus | 'legal', number> = { legal: 0, 'semi-restricted': 1, restricted: 2, banned: 3 }

/** Every card whose status differs, the strictest changes first. */
export function diffStatuses(before: Record<string, BanStatus>, after: Record<string, BanStatus>, nameOf: (key: string) => string): BanChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: BanChange[] = []
  for (const key of keys) {
    const from = before[key] ?? 'legal'
    const to = after[key] ?? 'legal'
    if (from !== to) changes.push({ key, name: nameOf(key), from, to })
  }
  return changes.sort((a, b) => SEVERITY[b.to] - SEVERITY[a.to] || a.name.localeCompare(b.name))
}

/** Whether an update has anything to show. */
export const hasChanges = (u: BanListUpdate) =>
  u.changes.length + u.pairsAdded.length + u.pairsRemoved.length + u.setsRotatedOut.length + u.setsBack.length > 0

/** What changed between two versions of a repo-kept format (decks are filled in by the caller). */
export function formatUpdate(gameId: GameId, formatLabel: string, before: Format, after: Format, nameOf: (key: string) => string): BanListUpdate {
  const pairs = (f: Format) => new Map(f.bannedPairs.map((p) => [pairKey(p), p] as const))
  const beforePairs = pairs(before)
  const afterPairs = pairs(after)
  const beforeSets = new Set(before.illegalSetIds ?? [])
  const afterSets = new Set(after.illegalSetIds ?? [])
  const named = ([a, b]: [string, string]): [string, string] => [nameOf(a), nameOf(b)]
  return {
    gameId,
    formatId: after.id,
    formatLabel,
    changes: diffStatuses(formatStatuses(before), formatStatuses(after), nameOf),
    pairsAdded: [...afterPairs].filter(([k]) => !beforePairs.has(k)).map(([, p]) => named(p)),
    pairsRemoved: [...beforePairs].filter(([k]) => !afterPairs.has(k)).map(([, p]) => named(p)),
    setsRotatedOut: [...afterSets].filter((s) => !beforeSets.has(s)).sort(),
    setsBack: [...beforeSets].filter((s) => !afterSets.has(s)).sort(),
    decks: [],
  }
}

/**
 * Yu-Gi-Oh! cards with the lists in `seen` laid over their legality. A list only counts when it's
 * newer than the card data (`lastSynced`): card data downloaded after it already has the same list or
 * a newer one. A card that isn't in a format at all (no legality entry for it) stays out of it.
 */
export function applyYgoBanLists(cards: Card[], seen: Record<string, BanSnapshot> | undefined, lastSynced: string | null): Card[] {
  const lists = Object.entries(seen ?? {})
    .filter(([key, s]) => key.startsWith('yugioh:') && (!lastSynced || s.updatedAt > lastSynced))
    .map(([key, s]) => [key.slice('yugioh:'.length), s.cards] as const)
  if (!lists.length) return cards
  let changed = false
  const out = cards.map((card) => {
    if (card.gameId !== 'yugioh' || !card.legality) return card
    let legality: Record<string, CardLegalityStatus> | null = null
    for (const [formatId, list] of lists) {
      if (card.legality[formatId] === undefined) continue
      const status: CardLegalityStatus = list[card.sourceId] ?? 'legal'
      if (card.legality[formatId] !== status) (legality ??= { ...card.legality })[formatId] = status
    }
    if (!legality) return card
    changed = true
    return { ...card, legality }
  })
  return changed ? out : cards
}

/** Cards on a format's list from the card data (games whose legality comes with the cards), one per name. */
export function listedCards(cards: readonly Card[], formatId: string): { status: BanStatus; card: Card }[] {
  const byName = new Map<string, { status: BanStatus; card: Card }>()
  for (const card of cards) {
    const status = card.legality?.[formatId]
    if (!isBanStatus(status) || byName.has(card.name)) continue
    byName.set(card.name, { status, card })
  }
  return [...byName.values()].sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || a.card.name.localeCompare(b.card.name))
}

export function sanitizeBanListsSeen(raw: unknown): Record<string, BanSnapshot> {
  const out: Record<string, BanSnapshot> = {}
  if (!isRecord(raw)) return out
  for (const [key, snap] of Object.entries(raw).slice(0, 50)) {
    if (!/^[a-z]+:[a-z0-9-]+$/.test(key) || !isRecord(snap) || typeof snap.updatedAt !== 'string') continue
    const cards = readStatusMap(snap.cards)
    if (cards) out[key] = { updatedAt: snap.updatedAt, cards }
  }
  return out
}

export function sanitizePublished(raw: unknown): PublishedFormat | undefined {
  return readPublishedFormat(raw) ?? undefined
}
