import type { Card, Collection } from './types'

/**
 * Finish and condition of owned copies. The collection itself stays a plain count per printing (it
 * syncs and trades that way); these details sit beside it and describe *some* of those copies. Copies
 * no detail covers are regular (non-foil) and Near Mint, so a collection without details means
 * exactly what it always did. Kept in settings (settingsItems.ts) and synced as 'copy_detail' items.
 */

export const FINISHES = ['normal', 'foil', 'etched'] as const
export type Finish = (typeof FINISHES)[number]

export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const
export type Condition = (typeof CONDITIONS)[number]

export interface CopyDetail {
  finish: Finish
  condition: Condition
  quantity: number
}

/** Card id -> the copies that aren't plain Near Mint, one entry per finish and condition. */
export type CollectionDetails = Record<string, CopyDetail[]>

export const isFinish = (value: unknown): value is Finish => (FINISHES as readonly unknown[]).includes(value)
export const isCondition = (value: unknown): value is Condition => (CONDITIONS as readonly unknown[]).includes(value)

const isPlain = (d: Pick<CopyDetail, 'finish' | 'condition'>) => d.finish === 'normal' && d.condition === 'NM'
const sameKind = (a: Pick<CopyDetail, 'finish' | 'condition'>, b: Pick<CopyDetail, 'finish' | 'condition'>) => a.finish === b.finish && a.condition === b.condition

/** Merges same-kind entries, drops plain and empty ones, and sorts (foil first, then best condition). */
export function normalizeDetails(details: readonly CopyDetail[]): CopyDetail[] {
  const out: CopyDetail[] = []
  for (const d of details) {
    const quantity = Math.floor(d.quantity)
    if (quantity <= 0 || isPlain(d)) continue
    const had = out.find((o) => sameKind(o, d))
    if (had) had.quantity += quantity
    else out.push({ finish: d.finish, condition: d.condition, quantity })
  }
  return out.sort((a, b) => FINISHES.indexOf(b.finish) - FINISHES.indexOf(a.finish) || CONDITIONS.indexOf(a.condition) - CONDITIONS.indexOf(b.condition))
}

/**
 * Every copy of a printing by finish and condition, plain Near Mint copies included, adding up to
 * `owned`. Details for more copies than you own (you removed some) are trimmed from the end: the
 * plain copies are the ones assumed to have gone first.
 */
export function copyBreakdown(owned: number, details: readonly CopyDetail[] | undefined): CopyDetail[] {
  let left = Math.max(0, Math.floor(owned))
  const out: CopyDetail[] = []
  for (const d of normalizeDetails(details ?? [])) {
    if (left <= 0) break
    const quantity = Math.min(d.quantity, left)
    out.push({ ...d, quantity })
    left -= quantity
  }
  if (left > 0) out.unshift({ finish: 'normal', condition: 'NM', quantity: left })
  return out
}

/** The details worth keeping for `owned` copies: trimmed to what you own, plain copies left implicit. */
export function fitDetails(owned: number, details: readonly CopyDetail[] | undefined): CopyDetail[] {
  return normalizeDetails(copyBreakdown(owned, details))
}

/** Sets how many copies of one finish and condition there are, leaving the rest as they were. */
export function withDetail(details: readonly CopyDetail[] | undefined, kind: Pick<CopyDetail, 'finish' | 'condition'>, quantity: number): CopyDetail[] {
  return normalizeDetails([...(details ?? []).filter((d) => !sameKind(d, kind)), { ...kind, quantity }])
}

/** The same collection's details, with each card's trimmed to its copies and cards you no longer own dropped. Returns the input when nothing changes. */
export function pruneDetails(details: CollectionDetails | undefined, collection: Collection): CollectionDetails | undefined {
  if (!details) return details
  let changed = false
  const out: CollectionDetails = {}
  for (const [cardId, list] of Object.entries(details)) {
    const fitted = fitDetails(collection[cardId] ?? 0, list)
    if (fitted.length === 0) {
      changed = true
      continue
    }
    if (JSON.stringify(fitted) !== JSON.stringify(list)) changed = true
    out[cardId] = fitted
  }
  return changed ? out : details
}

/**
 * What one copy of this finish is worth. Foil and etched copies use the card's foil price when its
 * source has one (Scryfall, TCGplayer's Foil / Holofoil rows); otherwise the regular price.
 * Condition doesn't change it: every price the app has is a Near Mint market price.
 */
export function copyPrice(card: Pick<Card, 'price' | 'foilPrice'>, finish: Finish): number | null {
  if (finish !== 'normal' && card.foilPrice != null && card.foilPrice > 0) return card.foilPrice
  return card.price ?? null
}

/** What `owned` copies of a card are worth with their finishes counted. */
export function ownedValue(card: Pick<Card, 'price' | 'foilPrice'>, owned: number, details: readonly CopyDetail[] | undefined): number {
  let total = 0
  for (const d of copyBreakdown(owned, details)) total += (copyPrice(card, d.finish) ?? 0) * d.quantity
  return total
}

/** Finish words the collection importers see in CSV files ("Foil", "Holofoil", "Reverse Holofoil", "etched", "normal"). */
export function parseFinish(text: string | undefined): Finish | null {
  const s = (text ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('etched')) return 'etched'
  if (/^(true|yes|1)$/.test(s) || s.includes('foil')) return 'foil'
  if (/^(false|no|0|normal|non-?foil|regular|unlimited|1st edition)$/.test(s)) return 'normal'
  return null
}

/** Condition words the importers see: "Near Mint", "NM", "Lightly Played", "excellent", "Damaged"... */
export function parseCondition(text: string | undefined): Condition | null {
  const s = (text ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (!s) return null
  if (/^(nm|m|mint|near mint|nm m)\b/.test(s) || s.includes('near mint')) return 'NM'
  if (/^(lp|sp|ex|excellent|lightly played|slightly played)\b/.test(s) || s.includes('light')) return 'LP'
  if (/^(mp|gd|good|moderately played|played|pl)\b/.test(s) || s.includes('moderate')) return 'MP'
  if (/^(hp|heavily played)\b/.test(s) || s.includes('heav')) return 'HP'
  if (/^(dmg|damaged|poor|po|d)\b/.test(s) || s.includes('damage')) return 'DMG'
  return null
}

/** Only well-formed entries, for data read from disk or pulled from the server. */
export function sanitizeCollectionDetails(raw: unknown): CollectionDetails {
  const out: CollectionDetails = {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out
  for (const [cardId, list] of Object.entries(raw as Record<string, unknown>).slice(0, 100000)) {
    const clean = sanitizeDetailList(list)
    if (clean.length) out[cardId] = clean
  }
  return out
}

export function sanitizeDetailList(list: unknown): CopyDetail[] {
  if (!Array.isArray(list)) return []
  const entries: CopyDetail[] = []
  for (const d of list.slice(0, 20)) {
    if (typeof d !== 'object' || d === null) continue
    const { finish, condition, quantity } = d as Record<string, unknown>
    if (isFinish(finish) && isCondition(condition) && typeof quantity === 'number' && Number.isFinite(quantity)) entries.push({ finish, condition, quantity })
  }
  return normalizeDetails(entries)
}
