/** How old a game's downloaded cards can get before the app downloads them again on its own, so new sets show up. */
export const RESYNC_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/** Whether cards last downloaded at `lastSynced` are due for a fresh download (never downloaded is left to the user). */
export function isCatalogStale(lastSynced: string | null | undefined, now = Date.now()): boolean {
  if (!lastSynced) return false
  const synced = Date.parse(lastSynced)
  return Number.isNaN(synced) || now - synced >= RESYNC_AFTER_MS
}
