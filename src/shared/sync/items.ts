import type { AppSettings, GameId } from '../types'
import type { SyncOp } from './ops'
import { sanitizePackOpenings, type PackOpening } from '../packOpenings'
import { sanitizePriceAlerts, type PriceAlerts } from '../priceAlerts'
import { MAX_POINTS, type ValueHistory, type ValuePoint } from '../valueHistory'

/**
 * Pack openings, price alerts and the collection-value graph live in settings, and sync as one
 * server row per item (deckbuilder_user_items in Pawmodoro's schema.sql): a pack opening by id, an
 * alert by card id, a value point by "<game>:<day>". Every settings save is diffed (itemOps) so only
 * the items that changed go up; a pull rebuilds the three fields from the rows (settingsFromItems).
 */

export type ItemKind = 'pack_opening' | 'price_alert' | 'value_point'

export interface ItemRow {
  kind: ItemKind
  key: string
  data: unknown
}

type SyncedSettings = Pick<AppSettings, 'packOpenings' | 'priceAlerts' | 'valueHistory'>

/** The three fields as rows. */
export function itemRows(settings: SyncedSettings): ItemRow[] {
  const rows: ItemRow[] = []
  for (const opening of settings.packOpenings ?? []) rows.push({ kind: 'pack_opening', key: opening.id, data: opening })
  for (const [cardId, alert] of Object.entries(settings.priceAlerts ?? {})) rows.push({ kind: 'price_alert', key: cardId, data: alert })
  for (const [gameId, points] of Object.entries(settings.valueHistory ?? {})) {
    for (const point of points ?? []) rows.push({ kind: 'value_point', key: `${gameId}:${point.d}`, data: { v: point.v } })
  }
  return rows
}

const rowKey = (row: ItemRow) => `${row.kind}\u0000${row.key}`

/** The set/delete ops that turn `before`'s items into `after`'s. */
export function itemOps(before: SyncedSettings, after: SyncedSettings): SyncOp[] {
  const old = new Map(itemRows(before).map((r) => [rowKey(r), r]))
  const now = new Map(itemRows(after).map((r) => [rowKey(r), r]))
  const ops: SyncOp[] = []
  for (const [key, row] of now) {
    const prev = old.get(key)
    if (!prev || JSON.stringify(prev.data) !== JSON.stringify(row.data)) ops.push({ type: 'set_item', kind: row.kind, key: row.key, data: row.data })
  }
  for (const [key, row] of old) if (!now.has(key)) ops.push({ type: 'set_item', kind: row.kind, key: row.key, data: null })
  return ops
}

/** Whether a settings patch touches a synced field (only then is a save diffed). */
export function touchesItems(patch: AppSettings): boolean {
  return 'packOpenings' in patch || 'priceAlerts' in patch || 'valueHistory' in patch
}

/** The three fields rebuilt from rows, dropping any that don't parse. Openings newest first, points in date order. */
export function settingsFromItems(rows: readonly ItemRow[]): Required<SyncedSettings> {
  const openings: unknown[] = []
  const alerts: Record<string, unknown> = {}
  const history: ValueHistory = {}
  for (const row of rows) {
    if (row.kind === 'pack_opening') openings.push(row.data)
    else if (row.kind === 'price_alert') alerts[row.key] = row.data
    else if (row.kind === 'value_point') {
      const at = row.key.lastIndexOf(':')
      const gameId = row.key.slice(0, at) as GameId
      const d = row.key.slice(at + 1)
      const v = (row.data as { v?: unknown } | null)?.v
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || typeof v !== 'number' || !Number.isFinite(v)) continue
      ;(history[gameId] ??= []).push({ d, v })
    }
  }
  for (const gameId of Object.keys(history) as GameId[]) {
    history[gameId] = (history[gameId] as ValuePoint[]).sort((a, b) => a.d.localeCompare(b.d)).slice(-MAX_POINTS)
  }
  const packOpenings: PackOpening[] = sanitizePackOpenings(openings).sort((a, b) => b.date.localeCompare(a.date))
  const priceAlerts: PriceAlerts = sanitizePriceAlerts(alerts)
  return { packOpenings, priceAlerts, valueHistory: history }
}

/**
 * The first pull after syncing these began: nothing is thrown away. Items only this device has are
 * kept and queued for upload (`upload`); for items on both, the server's copy wins, same as later pulls.
 */
export function firstMerge(local: SyncedSettings, server: readonly ItemRow[]): { settings: Required<SyncedSettings>; upload: SyncOp[] } {
  const onServer = new Set(server.map(rowKey))
  const onlyHere = itemRows(local).filter((r) => !onServer.has(rowKey(r)))
  return {
    settings: settingsFromItems([...server, ...onlyHere]),
    upload: onlyHere.map((r) => ({ type: 'set_item', kind: r.kind, key: r.key, data: r.data })),
  }
}
