/**
 * Each card's market price over the last 90 days, for the graph in its details. scripts/build-prices.ts
 * adds the day's prices (prices/<game>.json) to prices/history/<game>/<shard>.json every day; a card's
 * shard is a hash of its price key, so the app fetches one small file for the card it shows instead of
 * every card's history. The site is rebuilt on every deploy, so each build starts from the history the
 * live site already has.
 *
 * Only the games whose price files are small enough to keep 90 days of: Magic (96k printings) and
 * Yu-Gi-Oh! (161k set/rarity prices) would put hundreds of megabytes on the site.
 */
import type { Card, GameId } from './types'
import type { ValuePoint } from './valueHistory'
import { PRICE_FILES_URL } from './priceKeys'
import { priceKeysFor } from './priceRefresh'

/** Games with a price history, and how many files each is split into (about 100 cards a file). */
export const HISTORY_SHARDS: Partial<Record<GameId, number>> = { riftbound: 32, onepiece: 64, pokemon: 256 }
export const HISTORY_DAYS = 90

export interface PriceHistoryShard {
  /** "2026-10-05", oldest first. */
  days: string[]
  /** price key -> that day's price for each of `days` (null: not listed that day). */
  prices: Record<string, (number | null)[]>
}

export const emptyShard = (): PriceHistoryShard => ({ days: [], prices: {} })

/** FNV-1a: the same shard in the build script and the app. */
export function shardOf(key: string, shards: number): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % shards
}

export function historyUrl(gameId: GameId, shard: number): string {
  return `${PRICE_FILES_URL}/history/${gameId}/${shard}.json`
}

/**
 * `shard` with `day`'s prices added (replacing them if the day is already there: the site deploys
 * several times some days), cut to the last HISTORY_DAYS days. A card missing today gets null.
 */
export function addDay(shard: PriceHistoryShard, day: string, prices: Record<string, number>): PriceHistoryShard {
  const replacing = shard.days[shard.days.length - 1] === day
  const days = replacing ? shard.days : [...shard.days, day]
  const drop = Math.max(0, days.length - HISTORY_DAYS)
  const next: PriceHistoryShard['prices'] = {}
  for (const key of new Set([...Object.keys(shard.prices), ...Object.keys(prices)])) {
    const old = shard.prices[key] ?? []
    const values = Array.from({ length: days.length }, (_, i) => old[i] ?? null)
    values[days.length - 1] = prices[key] ?? null
    const kept = values.slice(drop)
    if (kept.some((v) => v != null)) next[key] = kept
  }
  return { days: days.slice(drop), prices: next }
}

/** A shard read from the site, or null when it isn't one (an old or broken file). */
export function parseShard(raw: unknown): PriceHistoryShard | null {
  if (!raw || typeof raw !== 'object') return null
  const { days, prices } = raw as Partial<PriceHistoryShard>
  if (!Array.isArray(days) || !days.every((d) => typeof d === 'string') || !prices || typeof prices !== 'object') return null
  return { days, prices }
}

/** The card's prices as graph points, from the first of its price keys the shard has. */
export function cardHistory(shard: PriceHistoryShard, keys: readonly string[]): ValuePoint[] {
  const key = keys.find((k) => shard.prices[k])
  if (!key) return []
  return shard.days.flatMap((d, i) => {
    const v = shard.prices[key][i]
    return v == null ? [] : [{ d, v }]
  })
}

const loaded = new Map<string, Promise<PriceHistoryShard | null>>()

/** The card's price history from the site (one shard, fetched once a session), or null for a game without one. */
export async function fetchCardHistory(card: Card): Promise<ValuePoint[] | null> {
  const shards = HISTORY_SHARDS[card.gameId]
  const keys = priceKeysFor(card)
  if (!shards || keys.length === 0) return null
  // A card's keys can land in different shards; the first (the one prices use first) is where it usually is.
  for (const key of keys) {
    const url = historyUrl(card.gameId, shardOf(key, shards))
    if (!loaded.has(url)) {
      loaded.set(
        url,
        fetch(url)
          .then((res) => (res.ok ? res.json() : null))
          .then(parseShard)
          .catch(() => {
            loaded.delete(url) // offline: try again next time
            return null
          }),
      )
    }
    const shard = await loaded.get(url)
    const points = shard ? cardHistory(shard, [key]) : []
    if (points.length) return points
  }
  return []
}
