import type { AppSettings, Card, Deck, Format, GameId } from '../shared/types'
import {
  REPO_LIST_GAMES,
  applyYgoBanLists,
  diffStatuses,
  formatUpdate,
  hasChanges,
  loadBanLists,
  mergePublishedFormat,
  type BanListUpdate,
  type BanSnapshot,
} from '../shared/banLists'
import { checkDeckLegality, gameSourceKey } from '../shared/legality'
import { getAdapter } from '../shared/games/registry'
import { YGO_FORMAT_IDS } from '../shared/games/yugioh'
import { formatLabel } from '../shared/formatText'
import type { GetState, SetState } from './storeUtils'

/** Whether you use this game here: it has decks, or its cards were downloaded. Only then is a change worth telling you about. */
function inUse(get: GetState, gameId: GameId): boolean {
  return get().decks.some((d) => d.gameId === gameId) || (get().syncMeta[gameId]?.count ?? 0) > 0
}

/** Loads a game's cards when you have decks for it, so the update can say which of them it affects. */
async function loadIfDecks(get: GetState, gameId: GameId): Promise<void> {
  if (get().catalogs[gameId] || !get().decks.some((d) => d.gameId === gameId) || !(get().syncMeta[gameId]?.count ?? 0)) return
  await get().loadCatalog(gameId).catch(() => undefined)
}

/** Names of the decks in this format that pass with `before` and fail with `after`. */
function newlyIllegal(decks: Deck[], gameId: GameId, formatId: string, before: { format: Format; byId: Map<string, Card> }, after: { format: Format; byId: Map<string, Card> }): string[] {
  const adapter = getAdapter(gameId)
  return decks
    .filter((d) => d.gameId === gameId && d.formatId === formatId)
    .filter((d) => checkDeckLegality(d, adapter, before.format, before.byId).legal && !checkDeckLegality(d, adapter, after.format, after.byId).legal)
    .map((d) => d.name)
}

/**
 * Reads the published ban lists (banLists.ts) and applies them: merged into the saved One Piece and
 * Riftbound formats, and laid over the Yu-Gi-Oh! card data. Returns what changed for the games you
 * use, for BanListUpdateModal. Never throws on a missing file: offline just means no change.
 */
export async function checkBanLists(get: GetState, set: SetState, persistSettings: (patch: AppSettings) => void): Promise<BanListUpdate[]> {
  const file = await loadBanLists()
  if (!file) return []
  const updates: BanListUpdate[] = []

  for (const gameId of REPO_LIST_GAMES) {
    const published = file.formats[gameId]
    const current = get().formats[gameId]
    if (!published || !current) continue
    const next = current.map((f) => (published[f.id] ? (mergePublishedFormat(f, published[f.id]) ?? f) : f))
    const changedIndexes = next.flatMap((f, i) => (f !== current[i] ? [i] : []))
    if (changedIndexes.length) {
      await loadIfDecks(get, gameId)
      const catalog = get().catalogs[gameId]
      const byKey = new Map((catalog?.cards ?? []).map((c) => [gameSourceKey(c), c.name]))
      const nameOf = (key: string) => byKey.get(key) ?? key.slice(key.indexOf(':') + 1)
      for (const i of changedIndexes) {
        const update = formatUpdate(gameId, formatLabel(gameId, next[i]), current[i], next[i], nameOf)
        if (!hasChanges(update) || !inUse(get, gameId)) continue
        if (catalog) update.decks = newlyIllegal(get().decks, gameId, next[i].id, { format: current[i], byId: catalog.byId }, { format: next[i], byId: catalog.byId })
        updates.push(update)
      }
      await get().saveFormats(gameId, next)
    } else {
      // Nothing new: the list was checked just now, so it isn't "maybe out of date" (not saved, it's checked every launch).
      set((s) => ({ formats: { ...s.formats, [gameId]: current.map((f) => (f.published && (f.reviewedAt ?? '') < file.updatedAt ? { ...f, reviewedAt: file.updatedAt } : f)) } }))
    }
  }

  if (file.yugioh) {
    const seen = { ...(get().settings.banListsSeen ?? {}) }
    let seenChanged = false
    const changedFormats: { formatId: string; before: BanSnapshot | undefined; after: BanSnapshot; names: Record<string, string> }[] = []
    for (const formatId of YGO_FORMAT_IDS) {
      const list = file.yugioh[formatId]
      if (!list) continue
      const key = `yugioh:${formatId}`
      const before = seen[key]
      if (before && JSON.stringify(before.cards) === JSON.stringify(list.cards)) continue
      const after: BanSnapshot = { updatedAt: file.updatedAt, cards: list.cards }
      seen[key] = after
      seenChanged = true
      // The first list seen on a device is just recorded: there's nothing it changed from.
      if (before) changedFormats.push({ formatId, before, after, names: list.names })
    }
    if (seenChanged) {
      await loadIfDecks(get, 'yugioh')
      const catalog = get().catalogs.yugioh
      const formats = get().formats.yugioh ?? getAdapter('yugioh').defaultFormats
      const lastSynced = get().syncMeta.yugioh?.lastSynced ?? null
      const beforeCards = catalog?.cards
      set((s) => ({ settings: { ...s.settings, banListsSeen: seen } }))
      persistSettings({ banListsSeen: seen })
      let afterById: Map<string, Card> | null = null
      if (catalog) {
        const cards = applyYgoBanLists(catalog.cards, seen, lastSynced)
        afterById = new Map(cards.map((c) => [c.id, c]))
        if (cards !== catalog.cards) set((s) => ({ catalogs: { ...s.catalogs, yugioh: { cards, byId: afterById! } } }))
      }
      if (inUse(get, 'yugioh')) {
        for (const { formatId, before, after, names } of changedFormats) {
          const format = formats.find((f) => f.id === formatId)
          if (!format || !before) continue
          const update: BanListUpdate = {
            gameId: 'yugioh',
            formatId,
            formatLabel: formatLabel('yugioh', format),
            changes: diffStatuses(before.cards, after.cards, (k) => names[k] ?? k),
            pairsAdded: [],
            pairsRemoved: [],
            setsRotatedOut: [],
            setsBack: [],
            decks: [],
          }
          if (!hasChanges(update)) continue
          if (catalog && beforeCards && afterById) {
            update.decks = newlyIllegal(get().decks, 'yugioh', formatId, { format, byId: catalog.byId }, { format, byId: afterById })
          }
          updates.push(update)
        }
      }
    }
  }
  return updates
}
