/**
 * What your collection of each game was worth, one point a day, so the Collection panel can draw how
 * it moves. Values are US dollars (like every price in the app) and are shown in the picked currency.
 * A day's point is overwritten as the day goes on (new cards, the day's price update), so each day
 * keeps its last value. Kept in the app settings (AppSettings.valueHistory), on each device.
 */
import type { GameId } from './types'

export interface ValuePoint {
  /** Local day, YYYY-MM-DD. */
  d: string
  /** Collection value that day, USD. */
  v: number
}

export type ValueHistory = Partial<Record<GameId, ValuePoint[]>>

/** About a year of points per game. */
export const MAX_POINTS = 400

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Today (or the given date) as a local YYYY-MM-DD. */
export function localDay(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The history with today's value for a game set, or null when nothing changes (same value as the
 * day's point already has, or nothing owned and nothing recorded yet).
 */
export function recordValue(history: ValueHistory | undefined, gameId: GameId, value: number, day: string): ValueHistory | null {
  const v = Math.round(value * 100) / 100
  if (!Number.isFinite(v) || v < 0) return null
  const points = history?.[gameId] ?? []
  const last = points[points.length - 1]
  if (!last && v === 0) return null
  if (last && last.d === day && last.v === v) return null
  const kept = last && last.d === day ? points.slice(0, -1) : points
  // A clock set back a day mustn't leave points out of order.
  const ordered = kept.filter((p) => p.d < day)
  return { ...history, [gameId]: [...ordered, { d: day, v }].slice(-MAX_POINTS) }
}

export interface ValueChange {
  from: ValuePoint
  to: ValuePoint
  /** USD */
  diff: number
  /** null when the start was 0 */
  percent: number | null
}

/**
 * How the value moved over the last `days` days: from the oldest point inside that window (or the
 * newest one before it, if there is one) to the latest. Null with fewer than two points.
 */
export function valueChange(points: ValuePoint[], days: number, today: string): ValueChange | null {
  if (points.length < 2) return null
  const to = points[points.length - 1]
  const since = localDay(new Date(new Date(`${today}T12:00:00`).getTime() - days * 86_400_000))
  let from = points[0]
  for (const p of points) {
    if (p.d <= since) from = p
    else break
  }
  if (from === to) from = points[points.length - 2]
  const diff = Math.round((to.v - from.v) * 100) / 100
  return { from, to, diff, percent: from.v > 0 ? (diff / from.v) * 100 : null }
}

/** Only well-formed points, in day order, per known game. */
export function sanitizeValueHistory(raw: unknown, gameIds: readonly GameId[]): ValueHistory {
  const out: ValueHistory = {}
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [gameId, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!gameIds.includes(gameId as GameId) || !Array.isArray(list)) continue
    const points = list
      .filter((p): p is ValuePoint => p != null && typeof p === 'object' && typeof p.d === 'string' && DAY_RE.test(p.d) && typeof p.v === 'number' && Number.isFinite(p.v) && p.v >= 0)
      .map((p) => ({ d: p.d, v: p.v }))
      .sort((a, b) => a.d.localeCompare(b.d))
      .filter((p, i, all) => i === all.length - 1 || all[i + 1].d !== p.d)
      .slice(-MAX_POINTS)
    if (points.length) out[gameId as GameId] = points
  }
  return out
}
