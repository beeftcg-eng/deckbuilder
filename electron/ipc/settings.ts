import { app, ipcMain } from 'electron'
import type { AppSettings, GameId } from '../../src/shared/types'
import { GAME_LIST } from '../../src/shared/games/registry'
import { isDeckViewMode } from '../../src/shared/deckView'
import { isThemeId } from '../../src/shared/themes'
import { isLanguage, languageFromLocale, setLanguage } from '../../src/shared/i18n'
import { isDeckSortMode } from '../../src/shared/deckOrder'
import { itemsFile, settingsFile } from '../lib/paths'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from '../lib/jsonStore'
import { sanitizeValueHistory } from '../../src/shared/valueHistory'
import { sanitizePriceAlerts } from '../../src/shared/priceAlerts'
import { sanitizePackOpenings } from '../../src/shared/packOpenings'
import { sanitizeCollectionBatches } from '../../src/shared/collectionBatches'
import { sanitizeCollectionDetails } from '../../src/shared/copyDetails'
import { hasItemFields, joinSettings, splitSettings, touchesItemFields } from '../../src/shared/settingsItems'
import { firstMerge, itemOps, settingsFromItems, touchesItems, type ItemRow } from '../../src/shared/sync/items'
import type { SyncOp } from '../../src/shared/sync/ops'
import { enqueueSyncOps } from './deckbuilderSync'

const GAME_IDS: GameId[] = GAME_LIST.map((adapter) => adapter.id)

// Only known keys with the right types get through, so a stale or hand-edited
// settings file can't feed the renderer something it doesn't expect.
export function sanitize(raw: unknown): AppSettings {
  const source = (isPlainObject(raw) ? raw : {}) as Record<string, unknown>
  const settings: AppSettings = {}
  if (typeof source.lastGameId === 'string' && GAME_IDS.includes(source.lastGameId as GameId)) {
    settings.lastGameId = source.lastGameId as GameId
  }
  if (typeof source.lastDeckId === 'string' || source.lastDeckId === null) settings.lastDeckId = source.lastDeckId
  if (isDeckSortMode(source.deckSort)) settings.deckSort = source.deckSort
  if (Array.isArray(source.gameOrder)) settings.gameOrder = [...new Set(source.gameOrder)].filter((id): id is GameId => GAME_IDS.includes(id as GameId))
  if (Array.isArray(source.hiddenGames)) settings.hiddenGames = [...new Set(source.hiddenGames)].filter((id): id is GameId => GAME_IDS.includes(id as GameId))
  if (Array.isArray(source.deckOrder)) settings.deckOrder = [...new Set(source.deckOrder.filter((id): id is string => typeof id === 'string'))].slice(0, 5000)
  if (isDeckViewMode(source.deckViewMode)) settings.deckViewMode = source.deckViewMode
  if (isThemeId(source.theme)) settings.theme = source.theme
  if (isLanguage(source.language)) settings.language = source.language
  if (source.tourSeen === true) settings.tourSeen = true
  // Currency and its last known exchange rates (shared/currency.ts): dropping these here is what made
  // picking a currency snap back to dollars on the desktop.
  if (typeof source.currency === 'string' && /^[A-Z]{3}$/.test(source.currency)) settings.currency = source.currency
  if (isPlainObject(source.currencyRates)) {
    const cr = source.currencyRates as Record<string, unknown>
    const rates: Record<string, number> = {}
    if (isPlainObject(cr.rates)) {
      for (const [code, rate] of Object.entries(cr.rates as Record<string, unknown>)) {
        if (/^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0) rates[code] = rate
      }
    }
    if (typeof cr.updatedAt === 'string' && Object.keys(rates).length) settings.currencyRates = { updatedAt: cr.updatedAt, rates }
  }
  // Which artwork to show for a Yu-Gi-Oh! card (shared/artChoice.ts): card id -> art id.
  if (isPlainObject(source.artChoices)) {
    const choices: Record<string, string> = {}
    for (const [cardId, artId] of Object.entries(source.artChoices as Record<string, unknown>).slice(0, 20000)) {
      if (typeof artId === 'string') choices[cardId] = artId
    }
    settings.artChoices = choices
  }
  if (source.valueHistory !== undefined) settings.valueHistory = sanitizeValueHistory(source.valueHistory, GAME_IDS)
  if (source.priceAlerts !== undefined) settings.priceAlerts = sanitizePriceAlerts(source.priceAlerts)
  if (source.packOpenings !== undefined) settings.packOpenings = sanitizePackOpenings(source.packOpenings)
  if (source.collectionBatches !== undefined) settings.collectionBatches = sanitizeCollectionBatches(source.collectionBatches, GAME_IDS)
  if (source.collectionDetails !== undefined) settings.collectionDetails = sanitizeCollectionDetails(source.collectionDetails)
  if (source.itemsSynced === true) settings.itemsSynced = true
  if (Array.isArray(source.tradeSeen)) settings.tradeSeen = source.tradeSeen.filter((k): k is string => typeof k === 'string').slice(0, 3000)
  if (isPlainObject(source.tradeProfile)) {
    const tp = source.tradeProfile as Record<string, unknown>
    if (typeof tp.public === 'boolean' && typeof tp.displayName === 'string') settings.tradeProfile = { public: tp.public, displayName: tp.displayName }
  }
  return settings
}

/** Messages made in this process (backup and account errors) follow the window's language: the saved choice, else the system's. */
function followLanguage(settings: AppSettings): AppSettings {
  setLanguage(settings.language ?? languageFromLocale(app.getLocale()))
  return settings
}

/** settings.json and items.json read as one AppSettings (settingsItems.ts). */
async function readSettings(): Promise<{ prefs: AppSettings; settings: AppSettings }> {
  const [prefs, items] = await Promise.all([
    readJsonFile<unknown>(settingsFile(), {}, isPlainObject).then(sanitize),
    readJsonFile<unknown>(itemsFile(), {}, isPlainObject).then(sanitize),
  ])
  return { prefs, settings: joinSettings(prefs, items) }
}

/**
 * Writes `next` back split in two. items.json is only rewritten when the records changed (or still
 * need moving out of settings.json), and before settings.json, so a crash between the two never loses them.
 */
async function writeSettings(prefs: AppSettings, next: AppSettings, patch: AppSettings): Promise<void> {
  const split = splitSettings(next)
  if (touchesItemFields(patch) || hasItemFields(prefs)) await writeJsonAtomic(itemsFile(), split.items)
  await writeJsonAtomic(settingsFile(), split.prefs)
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    return followLanguage((await readSettings()).settings)
  })

  ipcMain.handle('settings:set', (_e, patch: AppSettings): Promise<AppSettings> =>
    withLock('settings', async () => {
      const { prefs, settings: current } = await readSettings()
      const next = sanitize({ ...current, ...patch })
      await writeSettings(prefs, next, patch)
      // Pack openings, price alerts and value points sync item by item (shared/sync/items.ts).
      if (touchesItems(patch)) enqueueSyncOps(itemOps(current, next))
      return followLanguage(next)
    }),
  )
}

/** The records part of the settings (items.json), for backups. */
export async function readSettingsItems(): Promise<AppSettings> {
  return splitSettings((await readSettings()).settings).items
}

/** Replaces the records part of the settings with a backup's (only the fields it has). */
export function restoreSettingsItems(items: AppSettings): Promise<void> {
  return withLock('settings', async () => {
    const { prefs, settings: current } = await readSettings()
    const patch = splitSettings(sanitize(items)).items
    const next = sanitize({ ...current, ...patch })
    await writeSettings(prefs, next, patch)
    if (touchesItems(patch)) enqueueSyncOps(itemOps(current, next))
  })
}

/**
 * Writes pulled items into the settings (deckbuilderSync.ts's pull). The first time, local
 * items the server doesn't have are kept, and returned to be uploaded.
 */
export function applyPulledItems(rows: ItemRow[]): Promise<SyncOp[]> {
  return withLock('settings', async () => {
    const { prefs, settings: current } = await readSettings()
    const { settings, upload } = current.itemsSynced ? { settings: settingsFromItems(rows, current), upload: [] } : firstMerge(current, rows)
    const patch = { ...settings, itemsSynced: true }
    await writeSettings(prefs, sanitize({ ...current, ...patch }), patch)
    return upload
  })
}
