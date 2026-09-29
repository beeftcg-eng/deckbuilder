/**
 * Price alerts on wishlist cards: you set the most you'd pay for a card, and when the day's price
 * update (priceRefresh.ts) brings it down to that or below, the app tells you once. If the price goes
 * back up past the target, the alert re-arms. Targets are US dollars like every stored price (the
 * picker converts from the currency shown). Kept in the app settings (AppSettings.priceAlerts), keyed
 * by card id, on each device; an alert goes when its card leaves the wishlist.
 */
import type { Card, WishlistEntry } from './types'

export interface PriceAlert {
  /** Alert at or below this price, USD. */
  target: number
  /** Set once the alert went off, cleared when the price climbs back above the target. */
  hit?: boolean
}

export type PriceAlerts = Record<string, PriceAlert>

export interface PriceHit {
  card: Card
  price: number
  target: number
}

/**
 * Checks each alert against the current prices. Returns the alerts that just went off and the updated
 * alerts (null when nothing changed). Cards whose data isn't loaded are left alone; `wishlist` drops
 * the alerts of cards no longer on it, when given.
 */
export function checkPriceAlerts(
  alerts: PriceAlerts | undefined,
  lookup: (cardId: string) => Card | undefined,
  wishlist?: WishlistEntry[],
): { hits: PriceHit[]; next: PriceAlerts | null } {
  if (!alerts) return { hits: [], next: null }
  const wanted = wishlist ? new Set(wishlist.map((e) => e.cardId)) : null
  const hits: PriceHit[] = []
  const next: PriceAlerts = {}
  let changed = false
  for (const [cardId, alert] of Object.entries(alerts)) {
    if (wanted && !wanted.has(cardId)) {
      changed = true
      continue
    }
    const card = lookup(cardId)
    const price = card?.price
    if (card == null || price == null) {
      next[cardId] = alert
      continue
    }
    const below = price <= alert.target
    if (below && !alert.hit) hits.push({ card, price, target: alert.target })
    if (below !== !!alert.hit) {
      changed = true
      next[cardId] = below ? { target: alert.target, hit: true } : { target: alert.target }
    } else next[cardId] = alert
  }
  return { hits, next: changed ? next : null }
}

/** A target typed in the picked currency, as dollars (null for nothing usable). */
export function targetToUsd(typed: string, rate: number): number | null {
  const n = Number(typed.replace(',', '.').replace(/[^\d.]/g, ''))
  if (!typed.trim() || !Number.isFinite(n) || n <= 0 || !(rate > 0)) return null
  return Math.round((n / rate) * 10000) / 10000
}

/** Only well-formed alerts. */
export function sanitizePriceAlerts(raw: unknown): PriceAlerts {
  const out: PriceAlerts = {}
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [cardId, a] of Object.entries(raw as Record<string, unknown>).slice(0, 5000)) {
    if (a == null || typeof a !== 'object') continue
    const { target, hit } = a as { target?: unknown; hit?: unknown }
    if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) continue
    out[cardId] = hit === true ? { target, hit: true } : { target }
  }
  return out
}
