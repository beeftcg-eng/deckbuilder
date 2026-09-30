import type { AppSettings } from './types'

/**
 * The settings fields that hold the user's own records rather than preferences: pack openings, price
 * alerts, the value graph, collection batches and copy details. They grow with use, so they're kept
 * apart from the small preferences (theme, last deck...) that are saved on nearly every click: on the
 * desktop in items.json next to settings.json, in the phone app under their own IndexedDB key. The
 * app still sees one AppSettings; only storage is split.
 */
export const ITEM_FIELDS = ['packOpenings', 'priceAlerts', 'valueHistory', 'collectionBatches', 'collectionDetails', 'itemsSynced'] as const satisfies readonly (keyof AppSettings)[]

export type ItemField = (typeof ITEM_FIELDS)[number]

const isItemField = (key: string): key is ItemField => (ITEM_FIELDS as readonly string[]).includes(key)

/** The preferences and the records, as two objects. */
export function splitSettings(settings: AppSettings): { prefs: AppSettings; items: AppSettings } {
  const prefs: Record<string, unknown> = {}
  const items: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) continue
    ;(isItemField(key) ? items : prefs)[key] = value
  }
  return { prefs: prefs as AppSettings, items: items as AppSettings }
}

/** Whether a patch changes any record field (only then does the records file need writing). */
export function touchesItemFields(patch: AppSettings): boolean {
  return Object.keys(patch).some(isItemField)
}

/** Whether stored preferences still hold records from before the split (they move on the next save). */
export function hasItemFields(prefs: AppSettings): boolean {
  return touchesItemFields(prefs)
}

/**
 * One AppSettings from the two stores. The records store wins; before the first save after an update
 * it's empty, and the records still sitting in the preferences are used.
 */
export function joinSettings(prefs: AppSettings, items: AppSettings): AppSettings {
  return { ...prefs, ...splitSettings(items).items }
}
