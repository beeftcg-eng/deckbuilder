/**
 * The browser/PWA implementation of `DeckbuilderApi` (see electron/preload.ts for the Electron
 * one) - installed as `window.api` in src/main.tsx when running as a plain web page instead of
 * inside Electron. Every React component and the Zustand store call `window.api.*` exactly the
 * same way regardless of which one is actually installed, so none of that code needed to change.
 *
 * Local data (decks, collection, wishlist, formats, settings) lives in IndexedDB (idb.ts).
 * Decks/collection/wishlist are also kept in sync with the same Supabase project the desktop app
 * already offers to connect (webSyncStore.ts + shared/sync/engine.ts) - see supabase/schema.sql
 * in the Pawmodoro repo for the server side of this.
 */
import type {
  AppSettings,
  Binder,
  Card,
  CardCacheMeta,
  Collection,
  Deck,
  Format,
  GameId,
  PairingsConfig,
  PairingsDeckRecord,
  PawmodoroConfig,
  SyncProgress,
  TradeListing,
  TradeMatch,
  TradeWant,
  TraderProfile,
  WishlistEntry,
} from '../shared/types'
import type { UpdateStatus } from '../shared/updateStatus'
import type { PatchNote } from '../shared/patchNotes'
import { getAdapter } from '../shared/games/registry'
import { uniquifyCardIds } from '../shared/cardIds'
import { resolveDbImgUrl } from '../shared/dbImgUrl'
import { carryOverPrices } from '../shared/carryOverPrices'
import { fetchJson, USER_AGENT } from '../shared/games/fetchUtil'
import { callRpc, passwordLogin, refreshAccessToken, signUp as clientSignUp, type SyncConfig } from '../shared/sync/client'
import { SyncEngine } from '../shared/sync/engine'
import type { PulledState } from '../shared/sync/ops'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../shared/pawmodoroDefaults'
import { PAIRINGS_ANON_KEY, PAIRINGS_URL } from '../shared/pairingsDefaults'
import { fetchDeckRecords } from '../shared/pairingsRecord'
import { applyIdRepairs, type RepairableData } from '../shared/cardIdRepair'
import { idbGet, idbGetAll, idbSet, idbDelete, idbReplaceAll } from './idb'
import { WebSyncStore } from './webSyncStore'

const RELEASES_REPO = 'beeftcg-eng/deckbuilder-releases'

// ---------- cards ----------

interface CardCache {
  cards: Card[]
  lastSynced: string | null
}

async function readCardCache(gameId: GameId): Promise<CardCache> {
  return (await idbGet<CardCache>('cards', gameId)) ?? { cards: [], lastSynced: null }
}

/** dbimg:// -> the real image URL, for the main image and every alternate artwork. */
function resolveCardImages(card: Card): Card {
  if (!card.imageUrl?.startsWith('dbimg:') && !card.altImageUrlsSmall?.some((u) => u.startsWith('dbimg:'))) return card
  return {
    ...card,
    imageUrl: card.imageUrl ? resolveDbImgUrl(card.imageUrl) : card.imageUrl,
    imageUrlSmall: card.imageUrlSmall ? resolveDbImgUrl(card.imageUrlSmall) : card.imageUrlSmall,
    altImageUrlsSmall: card.altImageUrlsSmall?.map(resolveDbImgUrl),
  }
}

const cards = {
  meta: async (gameId: GameId): Promise<CardCacheMeta> => {
    const cache = await readCardCache(gameId)
    return { gameId, count: cache.cards.length, lastSynced: cache.lastSynced }
  },
  // Also resolves at load time (idempotent), so a cache synced before alternate artworks were
  // rewritten below shows them too without another "Update card data".
  load: async (gameId: GameId): Promise<Card[]> => (await readCardCache(gameId)).cards.map(resolveCardImages),
  sync: async (gameId: GameId): Promise<CardCacheMeta> => {
    const adapter = getAdapter(gameId)
    const previous = adapter.keepPricesWhenMissing ? await readCardCache(gameId) : null
    let fetched: Card[]
    try {
      const raw = await adapter.fetchAllCards((p) => {
        broadcast({ gameId, loaded: p.loaded, total: p.total, done: false })
      })
      // dbimg:// (Yu-Gi-Oh's hotlink-avoidance scheme) only resolves inside Electron's own
      // protocol handler - in a browser it just fails to load, so every card's image URL is
      // rewritten to the real one here, once, at sync time.
      fetched = uniquifyCardIds(
        raw.map(resolveCardImages),
      )
    } catch (err) {
      broadcast({ gameId, loaded: 0, total: 0, done: true, error: err instanceof Error ? err.message : String(err) })
      throw err
    }
    const finalCards = previous ? carryOverPrices(fetched, previous.cards) : fetched
    const cache: CardCache = { cards: finalCards, lastSynced: new Date().toISOString() }
    await idbSet('cards', gameId, cache)
    nameLookup.delete(gameId) // rebuilt from the new catalog on next use
    broadcast({ gameId, loaded: finalCards.length, total: finalCards.length, done: true })
    return { gameId, count: finalCards.length, lastSynced: cache.lastSynced }
  },
  onSyncProgress: (callback: (progress: SyncProgress) => void): (() => void) => {
    progressListeners.add(callback)
    return () => progressListeners.delete(callback)
  },
}

const progressListeners = new Set<(p: SyncProgress) => void>()
function broadcast(progress: SyncProgress): void {
  for (const listener of progressListeners) listener(progress)
}

// ---------- decks / collection / wishlist (synced) ----------

let syncEngine: SyncEngine | null = null
const syncStore = new WebSyncStore()
const pulledListeners = new Set<() => void>()

function cardIdParts(cardId: string): { gameId: string } {
  const gameId = cardId.split(':')[0]
  return { gameId }
}

async function applyPulledState(state: PulledState): Promise<void> {
  await idbReplaceAll(
    'decks',
    state.decks.map((d) => [d.id, { ...d.data, id: d.id, gameId: d.game_id as GameId }]),
  )
  await idbReplaceAll(
    'binders',
    // A pull against a not-yet-redeployed schema (before deckbuilder_binders existed server-side)
    // omits this key entirely rather than sending an empty array - tolerate that transitional
    // shape instead of crashing, same as an old client talking to a newer schema already does.
    (state.binders ?? []).map((b) => [b.id, { ...b.data, id: b.id }]),
  )
  const collection: Collection = {}
  const forTrade: string[] = []
  for (const row of state.collection) {
    collection[row.card_id] = row.quantity
    if (row.for_trade) forTrade.push(row.card_id)
  }
  await idbSet('settings', 'collection', collection)
  await idbSet('settings', 'forTrade', forTrade)

  // pushedTaskId/addedAt/id are local-only (the server never sees them, see
  // deckbuilder_wishlist_set_quantity in schema.sql) - preserve them across this full-array
  // replace the same way Pawmodoro's own _apply_remote_state does, or a pull would wipe the
  // record of an item already pushed to the Pawmodoro checklist.
  const previous = (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? []
  const previousByKey = new Map(previous.map((e) => [`${e.gameId}:${e.cardId}`, e]))
  const wishlist: WishlistEntry[] = state.wants.map((w) => {
    const key = `${w.game_id}:${w.card_id}`
    const match = previousByKey.get(key)
    return {
      id: match?.id ?? w.card_id,
      gameId: w.game_id as GameId,
      cardId: w.card_id,
      quantity: w.quantity,
      addedAt: match?.addedAt ?? new Date().toISOString(),
      pushedTaskId: match?.pushedTaskId ?? null,
    }
  })
  await idbSet('settings', 'wishlist', wishlist)

  for (const listener of pulledListeners) listener()
}

function ensureSyncEngine(): SyncEngine {
  if (!syncEngine) {
    syncEngine = new SyncEngine(
      syncStore,
      (state) => void applyPulledState(state),
      () => {}, // status surfaced via pawmodoro.getConfig() polling from the UI, same as Electron
    )
    void syncEngine.start()
  }
  return syncEngine
}

const decks = {
  list: async (): Promise<Deck[]> => idbGetAll<Deck>('decks'),
  save: async (deck: Deck, options?: { keepUpdatedAt?: boolean }): Promise<Deck> => {
    const now = new Date().toISOString()
    const existing = await idbGet<Deck>('decks', deck.id)
    const saved: Deck = existing
      ? { ...deck, createdAt: existing.createdAt, updatedAt: options?.keepUpdatedAt ? existing.updatedAt : now }
      : { ...deck, id: deck.id || crypto.randomUUID(), createdAt: deck.createdAt || now, updatedAt: now }
    await idbSet('decks', saved.id, saved)
    ensureSyncEngine()
    void syncEngine!.enqueue({ type: 'save_deck', id: saved.id, gameId: saved.gameId, data: saved })
    return saved
  },
  delete: async (deckId: string): Promise<void> => {
    await idbDelete('decks', deckId)
    ensureSyncEngine()
    void syncEngine!.enqueue({ type: 'delete_deck', id: deckId })
  },
}

const binders = {
  list: async (): Promise<Binder[]> => idbGetAll<Binder>('binders'),
  save: async (binder: Binder): Promise<Binder> => {
    const now = new Date().toISOString()
    const existing = await idbGet<Binder>('binders', binder.id)
    const saved: Binder = existing
      ? { ...binder, createdAt: existing.createdAt, updatedAt: now }
      : { ...binder, id: binder.id || crypto.randomUUID(), createdAt: binder.createdAt || now, updatedAt: now }
    await idbSet('binders', saved.id, saved)
    ensureSyncEngine()
    void syncEngine!.enqueue({ type: 'save_binder', id: saved.id, data: saved })
    return saved
  },
  delete: async (binderId: string): Promise<void> => {
    await idbDelete('binders', binderId)
    ensureSyncEngine()
    void syncEngine!.enqueue({ type: 'delete_binder', id: binderId })
  },
}

const MAX_OWNED = 999
function clampQuantity(quantity: number): number {
  return Math.min(MAX_OWNED, Math.max(0, Math.floor(Number(quantity) || 0)))
}

/** Card name/set code per game, built once per synced catalog (keyed by its lastSynced) rather than
 * reading every card from IndexedDB for each card saved - see electron/ipc/deckbuilderSync.ts. */
const nameLookup = new Map<string, { lastSynced: string | null; byId: Map<string, { name: string; setCode: string }> }>()

async function cardNameAndSet(cardId: string): Promise<{ name: string; setCode: string; gameId: string }> {
  const { gameId } = cardIdParts(cardId)
  let entry = nameLookup.get(gameId)
  if (!entry) {
    const cache = await readCardCache(gameId as GameId)
    entry = { lastSynced: cache.lastSynced, byId: new Map(cache.cards.map((c) => [c.id, { name: c.name, setCode: c.setCode }])) }
    nameLookup.set(gameId, entry)
  }
  const card = entry.byId.get(cardId)
  return { name: card?.name ?? cardId, setCode: card?.setCode ?? '', gameId }
}

const collection = {
  get: async (): Promise<Collection> => (await idbGet<Collection>('settings', 'collection')) ?? {},
  add: async (items: { cardId: string; quantity: number }[]): Promise<Collection> => {
    const current = (await idbGet<Collection>('settings', 'collection')) ?? {}
    const forTrade = (await idbGet<string[]>('settings', 'forTrade')) ?? []
    const droppedIds: string[] = []
    ensureSyncEngine()
    for (const { cardId, quantity } of items) {
      const next = clampQuantity((current[cardId] ?? 0) + quantity)
      if (next === 0) {
        delete current[cardId]
        droppedIds.push(cardId)
      } else current[cardId] = next
      const { name, setCode, gameId } = await cardNameAndSet(cardId)
      void syncEngine!.enqueue({ type: 'set_collection_quantity', gameId, cardId, cardName: name, setCode, quantity: next })
    }
    await idbSet('settings', 'collection', current)
    if (droppedIds.length > 0) {
      const nextForTrade = forTrade.filter((id) => !droppedIds.includes(id))
      if (nextForTrade.length !== forTrade.length) await idbSet('settings', 'forTrade', nextForTrade)
    }
    return current
  },
  getForTrade: async (): Promise<string[]> => (await idbGet<string[]>('settings', 'forTrade')) ?? [],
  setForTrade: async (cardId: string, forTrade: boolean): Promise<string[]> => {
    const current = (await idbGet<string[]>('settings', 'forTrade')) ?? []
    const next = forTrade ? [...new Set([...current, cardId])] : current.filter((id) => id !== cardId)
    await idbSet('settings', 'forTrade', next)
    const { gameId } = cardIdParts(cardId)
    ensureSyncEngine()
    void syncEngine!.enqueue({ type: 'set_for_trade', gameId, cardId, forTrade })
    return next
  },
}

function addOrIncrement(entries: WishlistEntry[], gameId: GameId, cardId: string, quantity: number): WishlistEntry {
  const existing = entries.find((e) => e.gameId === gameId && e.cardId === cardId)
  if (existing) {
    existing.quantity += quantity
    return existing
  }
  const created = { id: crypto.randomUUID(), gameId, cardId, quantity, addedAt: new Date().toISOString(), pushedTaskId: null }
  entries.push(created)
  return created
}

async function enqueueWishlistSync(gameId: GameId, cardId: string, quantity: number): Promise<void> {
  const { name } = await cardNameAndSet(cardId)
  ensureSyncEngine()
  void syncEngine!.enqueue({ type: 'wishlist_set_quantity', gameId, cardId, cardName: name, quantity })
}

const wishlist = {
  list: async (): Promise<WishlistEntry[]> => (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? [],
  add: async (gameId: GameId, cardId: string, quantity: number): Promise<WishlistEntry[]> => {
    const entries = (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? []
    const entry = addOrIncrement(entries, gameId, cardId, quantity)
    await idbSet('settings', 'wishlist', entries)
    await enqueueWishlistSync(gameId, cardId, entry.quantity)
    return entries
  },
  addMany: async (items: { gameId: GameId; cardId: string; quantity: number }[]): Promise<WishlistEntry[]> => {
    const entries = (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? []
    for (const { gameId, cardId, quantity } of items) {
      const entry = addOrIncrement(entries, gameId, cardId, quantity)
      await enqueueWishlistSync(gameId, cardId, entry.quantity)
    }
    await idbSet('settings', 'wishlist', entries)
    return entries
  },
  setQuantity: async (entryId: string, quantity: number): Promise<WishlistEntry[]> => {
    let entries = (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? []
    const entry = entries.find((e) => e.id === entryId)
    if (quantity <= 0) {
      entries = entries.filter((e) => e.id !== entryId)
    } else if (entry) {
      entry.quantity = quantity
    }
    await idbSet('settings', 'wishlist', entries)
    if (entry) await enqueueWishlistSync(entry.gameId, entry.cardId, quantity)
    return entries
  },
  remove: async (entryId: string): Promise<WishlistEntry[]> => {
    const entries = (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? []
    const entry = entries.find((e) => e.id === entryId)
    const next = entries.filter((e) => e.id !== entryId)
    await idbSet('settings', 'wishlist', next)
    if (entry) await enqueueWishlistSync(entry.gameId, entry.cardId, 0)
    return next
  },
  markPushed: async (results: { entryId: string; taskId: string }[]): Promise<WishlistEntry[]> => {
    const entries = (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? []
    for (const { entryId, taskId } of results) {
      const entry = entries.find((e) => e.id === entryId)
      if (entry) entry.pushedTaskId = taskId
    }
    await idbSet('settings', 'wishlist', entries)
    return entries
  },
}

// ---------- formats (read-only bundled defaults for v1 - no in-app ban-list editor on web yet) ----------

const formats = {
  list: async (gameId: GameId): Promise<Format[]> => {
    const saved = await idbGet<Format[]>('formats', gameId)
    return saved ?? getAdapter(gameId).defaultFormats
  },
  path: async (): Promise<string> => '(stored in this browser only)',
  save: async (gameId: GameId, list: Format[]): Promise<Format[]> => {
    await idbSet('formats', gameId, list)
    return list
  },
}

// ---------- settings ----------

const settingsApi = {
  get: async (): Promise<AppSettings> => (await idbGet<AppSettings>('settings', 'app')) ?? {},
  set: async (patch: AppSettings): Promise<AppSettings> => {
    const current = (await idbGet<AppSettings>('settings', 'app')) ?? {}
    const next = { ...current, ...patch }
    await idbSet('settings', 'app', next)
    return next
  },
}

// ---------- pawmodoro (auth + trading, mirrors electron/ipc/pawmodoro.ts) ----------

function toPublicConfig(config: SyncConfig | null): PawmodoroConfig {
  return {
    url: config?.url || DEFAULT_PAWMODORO_URL,
    anonKey: config?.anonKey || DEFAULT_PAWMODORO_ANON_KEY,
    email: config?.email ?? '',
    connected: !!config?.refreshToken,
  }
}

const pawmodoro = {
  getConfig: async (): Promise<PawmodoroConfig> => toPublicConfig(await syncStore.getConfig()),
  connect: async (url: string, anonKey: string, email: string, password: string, doSignUp = false): Promise<PawmodoroConfig> => {
    const cleanUrl = (url.trim() || DEFAULT_PAWMODORO_URL).replace(/\/$/, '')
    const key = anonKey.trim() || DEFAULT_PAWMODORO_ANON_KEY
    let refreshToken: string | null
    if (doSignUp) {
      refreshToken = (await clientSignUp(cleanUrl, key, email, password)).refreshToken
      if (!refreshToken) throw new Error('Account created — check your email to confirm it, then press Log in.')
    } else {
      refreshToken = (await passwordLogin(cleanUrl, key, email, password)).refreshToken
    }
    const config: SyncConfig = { url: cleanUrl, anonKey: key, refreshToken, email }
    await syncStore.setConfig(config)
    ensureSyncEngine()
    return toPublicConfig(config)
  },
  disconnect: async (): Promise<PawmodoroConfig> => {
    await syncStore.clearConfig()
    syncEngine?.stop()
    syncEngine = null
    return toPublicConfig(null)
  },
  // Wishlist->Pawmodoro-checklist push and trading still go through the exact same RPCs the
  // desktop app uses; reusing shared/sync/client's callRpc keeps this small.
  pushWishlist: async (
    items: { entryId: string; text: string }[],
  ): Promise<{ pushed: { entryId: string; taskId: string }[]; failed: { entryId: string; message: string }[] }> => {
    const config = await syncStore.getConfig()
    if (!config) throw new Error('Not connected to Pawmodoro')
    const { accessToken } = await refreshAccessToken(config)
    const pushed: { entryId: string; taskId: string }[] = []
    const failed: { entryId: string; message: string }[] = []
    for (const item of items) {
      try {
        const task = (await callRpc(config, accessToken, 'add_task', {
          p_text: item.text,
          p_recurrence: 'once',
          p_source: 'wishlist',
        })) as { id: string }
        pushed.push({ entryId: item.entryId, taskId: task.id })
      } catch (err) {
        failed.push({ entryId: item.entryId, message: err instanceof Error ? err.message : String(err) })
      }
    }
    return { pushed, failed }
  },
  setTradeProfile: async (isPublic: boolean, displayName: string): Promise<void> => {
    const config = await syncStore.getConfig()
    if (!config) throw new Error('Not connected to Pawmodoro')
    const { accessToken } = await refreshAccessToken(config)
    await callRpc(config, accessToken, 'deckbuilder_set_profile', { p_public: isPublic, p_display_name: displayName })
  },
  syncTradeCollection: async (entries: TradeListing[]): Promise<void> => {
    const config = await syncStore.getConfig()
    if (!config) throw new Error('Not connected to Pawmodoro')
    const { accessToken } = await refreshAccessToken(config)
    await callRpc(config, accessToken, 'deckbuilder_sync_collection', {
      p_entries: entries.map((e) => ({
        game_id: e.gameId, card_id: e.cardId, card_name: e.cardName, set_code: e.setCode, quantity: e.quantity, for_trade: e.forTrade,
      })),
    })
  },
  syncTradeWants: async (entries: TradeWant[]): Promise<void> => {
    const config = await syncStore.getConfig()
    if (!config) throw new Error('Not connected to Pawmodoro')
    const { accessToken } = await refreshAccessToken(config)
    await callRpc(config, accessToken, 'deckbuilder_sync_wants', {
      p_entries: entries.map((e) => ({ game_id: e.gameId, card_id: e.cardId, card_name: e.cardName, quantity: e.quantity })),
    })
  },
  browseTraders: async (): Promise<TraderProfile[]> => {
    const config = await syncStore.getConfig()
    if (!config) throw new Error('Not connected to Pawmodoro')
    const { accessToken } = await refreshAccessToken(config)
    const rows = (await callRpc(config, accessToken, 'deckbuilder_browse', {})) as Array<{
      user_id: string
      display_name: string
      email: string
      collection: Array<{ game_id: string; card_id: string; card_name: string; set_code: string; quantity: number; for_trade: boolean }>
      wants: Array<{ game_id: string; card_id: string; card_name: string; quantity: number }>
    }>
    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      collection: r.collection.map((c) => ({
        gameId: c.game_id as TradeListing['gameId'], cardId: c.card_id, cardName: c.card_name, setCode: c.set_code, quantity: c.quantity, forTrade: c.for_trade,
      })),
      wants: r.wants.map((w) => ({ gameId: w.game_id as TradeWant['gameId'], cardId: w.card_id, cardName: w.card_name, quantity: w.quantity })),
    }))
  },
  tradeMatches: async (): Promise<TradeMatch[]> => {
    const config = await syncStore.getConfig()
    if (!config) throw new Error('Not connected to Pawmodoro')
    const { accessToken } = await refreshAccessToken(config)
    const rows = (await callRpc(config, accessToken, 'deckbuilder_matches', {})) as Array<{
      user_id: string
      display_name: string
      email: string
      they_have_what_i_want: Array<{ game_id: string; card_name: string }>
      i_have_what_they_want: Array<{ game_id: string; card_name: string }>
      mutual: boolean
    }>
    return rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      email: r.email,
      theyHaveWhatIWant: r.they_have_what_i_want.map((c) => ({ gameId: c.game_id as TradeMatch['theyHaveWhatIWant'][number]['gameId'], cardName: c.card_name })),
      iHaveWhatTheyWant: r.i_have_what_they_want.map((c) => ({ gameId: c.game_id as TradeMatch['iHaveWhatTheyWant'][number]['gameId'], cardName: c.card_name })),
      mutual: r.mutual,
    }))
  },
  onSyncPulled: (callback: () => void): (() => void) => {
    pulledListeners.add(callback)
    return () => pulledListeners.delete(callback)
  },
}

// ---------- backup (browser download/upload, no filesystem access) ----------

async function snapshotBlob(): Promise<Blob> {
  const [d, b, c, ft, w, s] = await Promise.all([
    idbGetAll<Deck>('decks'),
    idbGetAll<Binder>('binders'),
    idbGet<Collection>('settings', 'collection'),
    idbGet<string[]>('settings', 'forTrade'),
    idbGet<WishlistEntry[]>('settings', 'wishlist'),
    idbGet<AppSettings>('settings', 'app'),
  ])
  const payload = { decks: d, binders: b, collection: c ?? {}, forTrade: ft ?? [], wishlist: w ?? [], settings: s ?? {} }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

const backup = {
  export: async (): Promise<boolean> => {
    const blob = await snapshotBlob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `deckbuilder-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    return true
  },
  import: async (): Promise<{ imported: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'application/json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return resolve({ imported: false })
        try {
          const data = JSON.parse(await file.text())
          if (Array.isArray(data.decks)) await idbReplaceAll('decks', data.decks.map((d: Deck) => [d.id, d]))
          if (Array.isArray(data.binders)) await idbReplaceAll('binders', data.binders.map((b: Binder) => [b.id, b]))
          if (data.collection) await idbSet('settings', 'collection', data.collection)
          if (data.forTrade) await idbSet('settings', 'forTrade', data.forTrade)
          if (data.wishlist) await idbSet('settings', 'wishlist', data.wishlist)
          if (data.settings) await idbSet('settings', 'app', data.settings)
          resolve({ imported: true })
        } catch (err) {
          resolve({ imported: false, error: err instanceof Error ? err.message : String(err) })
        }
      }
      input.click()
    })
  },
  openFolder: async (): Promise<void> => {
    // No filesystem in a browser - Export/Import above are the web equivalent.
  },
}

// ---------- updater (the PWA updates via its service worker, not electron-updater) ----------

const updater = {
  status: async (): Promise<UpdateStatus> => ({ state: 'uptodate', version: __APP_VERSION__ }),
  check: async (): Promise<void> => {
    const reg = await navigator.serviceWorker?.getRegistration()
    await reg?.update()
  },
  install: async (): Promise<void> => {
    window.location.reload()
  },
  onStatus: (): (() => void) => () => {},
}

// ---------- export / images / system / patch notes / clipboard ----------

function downloadBlob(blob: Blob, filename: string): boolean {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
  return true
}

const exportPaste = async (content: string): Promise<string> => {
  const res = await fetch('https://dpaste.com/api/v2/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ content, syntax: 'text', expiry_days: '365' }),
  })
  if (!res.ok) throw new Error(`dpaste.com error (${res.status})`)
  return (await res.text()).trim()
}

const exportSaveFile = async (content: string, suggestedName: string): Promise<boolean> =>
  downloadBlob(new Blob([content], { type: 'text/plain' }), suggestedName)

const exportSaveImage = async (dataUrl: string, suggestedName: string): Promise<boolean> => {
  const res = await fetch(dataUrl)
  return downloadBlob(await res.blob(), suggestedName)
}

const images = {
  fetchDataUri: async (url: string): Promise<string> => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url}`)
    const blob = await res.blob()
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  },
}

const system = {
  openExternal: async (url: string): Promise<void> => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  showFile: async (): Promise<void> => {},
}

const patchNotes = {
  list: async (): Promise<PatchNote[]> => {
    const releases = await fetchJson<
      { tag_name: string; name: string | null; body: string | null; published_at: string; html_url: string; draft: boolean; prerelease: boolean }[]
    >(`https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=15`, 1, { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' })
    return releases
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => ({ version: r.tag_name.replace(/^v/, ''), name: r.name ?? r.tag_name, body: r.body ?? '', publishedAt: r.published_at, url: r.html_url }))
  },
}

// ---------- card id repair (mirrors electron/ipc/cardIdRepair.ts) ----------

async function repairCardIds(pairs: [string, string][]): Promise<RepairableData & { repaired: number }> {
  const input: RepairableData = {
    decks: await idbGetAll<Deck>('decks'),
    binders: await idbGetAll<Binder>('binders'),
    collection: (await idbGet<Collection>('settings', 'collection')) ?? {},
    forTrade: (await idbGet<string[]>('settings', 'forTrade')) ?? [],
    wishlist: (await idbGet<WishlistEntry[]>('settings', 'wishlist')) ?? [],
  }
  const result = applyIdRepairs(input, new Map(pairs))
  if (result.repaired === 0 && result.forTradeChanges.length === 0) return { ...input, repaired: 0 }
  const { data } = result
  ensureSyncEngine()
  for (const deck of data.decks.filter((d) => result.changedDeckIds.includes(d.id))) {
    await idbSet('decks', deck.id, deck)
    void syncEngine!.enqueue({ type: 'save_deck', id: deck.id, gameId: deck.gameId, data: deck })
  }
  for (const binder of data.binders.filter((b) => result.changedBinderIds.includes(b.id))) {
    await idbSet('binders', binder.id, binder)
    void syncEngine!.enqueue({ type: 'save_binder', id: binder.id, data: binder })
  }
  if (result.collectionChanges.length) await idbSet('settings', 'collection', data.collection)
  if (result.forTradeChanges.length) await idbSet('settings', 'forTrade', data.forTrade)
  if (result.wishlistChanges.length) await idbSet('settings', 'wishlist', data.wishlist)
  for (const { cardId, quantity } of result.collectionChanges) {
    const { name, setCode, gameId } = await cardNameAndSet(cardId)
    void syncEngine!.enqueue({ type: 'set_collection_quantity', gameId, cardId, cardName: name, setCode, quantity })
  }
  for (const { cardId, forTrade } of result.forTradeChanges) {
    void syncEngine!.enqueue({ type: 'set_for_trade', gameId: cardIdParts(cardId).gameId, cardId, forTrade })
  }
  for (const { cardId, quantity } of result.wishlistChanges) await enqueueWishlistSync(cardIdParts(cardId).gameId as GameId, cardId, quantity)
  return { ...data, repaired: result.repaired }
}

// ---------- pairings (tournament results; mirrors electron/ipc/pairings.ts) ----------

// A different account from Pawmodoro's, so it gets its own key in the 'sync' store.
const PAIRINGS_CONFIG_KEY = 'pairingsConfig'

async function readPairingsConfig(): Promise<SyncConfig | null> {
  return (await idbGet<SyncConfig | null>('sync', PAIRINGS_CONFIG_KEY)) ?? null
}

function toPairingsPublicConfig(config: SyncConfig | null): PairingsConfig {
  return { email: config?.email ?? '', connected: !!config?.refreshToken }
}

const pairings = {
  getConfig: async (): Promise<PairingsConfig> => toPairingsPublicConfig(await readPairingsConfig()),
  connect: async (email: string, password: string): Promise<PairingsConfig> => {
    const { refreshToken } = await passwordLogin(PAIRINGS_URL, PAIRINGS_ANON_KEY, email, password)
    const config: SyncConfig = { url: PAIRINGS_URL, anonKey: PAIRINGS_ANON_KEY, email, refreshToken }
    await idbSet('sync', PAIRINGS_CONFIG_KEY, config)
    return toPairingsPublicConfig(config)
  },
  disconnect: async (): Promise<PairingsConfig> => {
    await idbSet('sync', PAIRINGS_CONFIG_KEY, null)
    return toPairingsPublicConfig(null)
  },
  deckRecords: async (): Promise<PairingsDeckRecord[]> => {
    const config = await readPairingsConfig()
    if (!config) throw new Error('Not connected to Pairings')
    const { records, refreshToken } = await fetchDeckRecords(config)
    if (refreshToken !== config.refreshToken) await idbSet('sync', PAIRINGS_CONFIG_KEY, { ...config, refreshToken })
    return records
  },
}

const clipboardApi = {
  writeText: async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
  },
  // Browsers only take PNG on the clipboard, so a JPEG card scan is redrawn as PNG first.
  writeImage: async (dataUrl: string): Promise<void> => {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image"))), 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
  },
}

// ---------- assembled API, matching electron/preload.ts's shape exactly ----------

export const webApi = {
  cards,
  decks,
  binders,
  formats,
  collection,
  settings: settingsApi,
  wishlist,
  pawmodoro,
  pairings,
  repairCardIds,
  backup,
  updater,
  exportPaste,
  exportSaveFile,
  exportSaveImage,
  images,
  system,
  patchNotes,
  clipboard: clipboardApi,
}

declare const __APP_VERSION__: string

export function installWebApiIfNeeded(): void {
  if (typeof window.api === 'undefined') {
    ;(window as unknown as { api: typeof webApi }).api = webApi
    void syncStore.getConfig().then((c) => c && ensureSyncEngine())
  }
}
