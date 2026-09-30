import type { AppSettings, Card, Deck, GameId, TradeMatch } from '../shared/types'
import { GAME_LIST, getAdapter } from '../shared/games/registry'
import { gameIdOfCardId, totalPrice } from '../shared/collection'
import { localDay, recordValue, type ValueHistory } from '../shared/valueHistory'
import { checkPriceAlerts } from '../shared/priceAlerts'
import { notify } from '../lib/notify'
import { freshTradeMatches } from '../shared/tradeAlerts'
import type { CollectionDetails, CopyDetail } from '../shared/copyDetails'
import { formatMoney } from '../shared/currency'
import { withListHash, withSummary } from '../shared/deckSummary'
import { t } from '../shared/i18n'
import { MAX_UNDO, errorMessage, lookupIn, type GetState, type SetState, type UndoEntry } from './storeUtils'

/** The helpers every slice shares: saving settings and decks, undo, and the background checks (prices, alerts, trade matches). */
export type StoreContext = ReturnType<typeof createStoreContext>

export function createStoreContext(set: SetState, get: GetState) {
  /** Set once the collection and wishlist are loaded at startup: collection values and price alerts need them. */
  const flags = { startupLoaded: false }

  function persistSettings(patch: AppSettings) {
    window.api.settings
      .set(patch)
      .then((settings) => set({ settings }))
      .catch((err) => console.error("Couldn't save settings:", err))
  }

  function pushUndo(entry: UndoEntry) {
    set((s) => ({ undoStack: [...s.undoStack, entry].slice(-MAX_UNDO) }))
  }

  /** The deck with its readable summary refreshed, when its game's cards are loaded (see deckSummary.ts). */
  function summarized(deck: Deck): Deck {
    const catalog = get().catalogs[deck.gameId]
    if (!catalog) return withListHash(deck)
    const formats = get().formats[deck.gameId] ?? getAdapter(deck.gameId).defaultFormats
    return withSummary(deck, catalog.byId, formats.find((f) => f.id === deck.formatId)?.label ?? null)
  }

  let valueSaveTimer: ReturnType<typeof setTimeout> | undefined
  /** The newest value history while its save waits (another settings save meanwhile returns the older one). */
  let pendingValues: ValueHistory | null = null

  function recordValueOf(gameId: GameId) {
    const catalog = get().catalogs[gameId]
    if (!flags.startupLoaded || !catalog || !getAdapter(gameId).hasPrices) return
    const items: { card: Card; quantity: number; details?: CopyDetail[] }[] = []
    for (const [cardId, copies] of Object.entries(get().collection)) {
      if (gameIdOfCardId(cardId) !== gameId) continue
      const card = catalog.byId.get(cardId)
      if (card) items.push({ card, quantity: copies, details: get().settings.collectionDetails?.[cardId] })
    }
    const next = recordValue(pendingValues ?? get().settings.valueHistory, gameId, totalPrice(items).total, localDay())
    if (!next) return
    pendingValues = next
    set((s) => ({ settings: { ...s.settings, valueHistory: next } }))
    // Tapping + a few times in a row saves once.
    clearTimeout(valueSaveTimer)
    valueSaveTimer = setTimeout(() => {
      if (pendingValues) persistSettings({ valueHistory: pendingValues })
      pendingValues = null
    }, 1500)
  }

  function saveDetails(collectionDetails: CollectionDetails) {
    set((s) => ({ settings: { ...s.settings, collectionDetails } }))
    persistSettings({ collectionDetails })
  }

  /** Price alerts against the prices loaded now: the ones that just went off are shown (and notified). */
  function checkAlerts() {
    if (!flags.startupLoaded) return
    const { catalogs, wishlist, settings } = get()
    const { hits, next } = checkPriceAlerts(settings.priceAlerts, lookupIn(catalogs), wishlist)
    if (next) {
      set((s) => ({ settings: { ...s.settings, priceAlerts: next } }))
      persistSettings({ priceAlerts: next })
    }
    if (hits.length === 0) return
    const text =
      hits.length === 1
        ? t.priceAlerts.hitOne(hits[0].card.name, formatMoney(hits[0].price), formatMoney(hits[0].target))
        : t.priceAlerts.hitMany(hits.length, hits.map((h) => h.card.name).join(', '))
    set({ notice: text })
    void notify(t.priceAlerts.notifyTitle, text)
  }

  /** Loads the cards of games that have price alerts, so they're checked even if the game isn't open. */
  async function loadAlertCatalogs() {
    const alerts = get().settings.priceAlerts ?? {}
    const games = new Set(get().wishlist.filter((e) => alerts[e.cardId]).map((e) => e.gameId))
    for (const gameId of games) {
      if (!get().catalogs[gameId] && get().syncMeta[gameId]?.count) await get().loadCatalog(gameId).catch(() => undefined)
    }
  }

  const TRADE_CHECK_EVERY_MS = 3 * 60 * 60 * 1000
  let lastTradeCheck = 0
  /** Remembers the matches seen now; announces (and notifies) the new ones unless `quiet`. */
  function noteTradeMatches(matches: TradeMatch[], quiet: boolean) {
    const { fresh, seen } = freshTradeMatches(matches, get().settings.tradeSeen)
    set((s) => ({ settings: { ...s.settings, tradeSeen: seen } }))
    persistSettings({ tradeSeen: seen })
    if (quiet || fresh.length === 0) return
    const text = fresh.length === 1 ? t.tradeAlerts.one(fresh[0].displayName, fresh[0].have, fresh[0].want) : t.tradeAlerts.many(fresh.length, fresh.map((f) => f.displayName).join(', '))
    set({ notice: text })
    void notify(t.tradeAlerts.title, text)
  }
  /** New trade matches since the last look (tradeAlerts.ts), while your trade profile is public. */
  async function checkTradeMatches(): Promise<void> {
    if (!flags.startupLoaded || !get().settings.tradeProfile?.public) return
    if (Date.now() - lastTradeCheck < TRADE_CHECK_EVERY_MS) return
    lastTradeCheck = Date.now()
    try {
      const tradeMatches = await window.api.pawmodoro.tradeMatches()
      set({ tradeMatches })
      noteTradeMatches(tradeMatches, false)
    } catch {
      // Not connected or offline: try again next time.
    }
  }

  const PRICE_CHECK_EVERY_MS = 6 * 60 * 60 * 1000
  let lastPriceCheck = 0
  /** Applies the day's published prices to each downloaded game's saved cards (priceRefresh.ts). */
  async function refreshAllPrices(): Promise<void> {
    if (Date.now() - lastPriceCheck < PRICE_CHECK_EVERY_MS) return
    lastPriceCheck = Date.now()
    for (const adapter of GAME_LIST) {
      const gameId = adapter.id
      if (!get().syncMeta[gameId]?.count) continue
      const progress = get().syncProgress[gameId]
      if (progress && !progress.done) continue // a full download is on its way anyway
      const result = await window.api.cards.refreshPrices(gameId).catch(() => null)
      if (result?.changed && get().catalogs[gameId]) await get().loadCatalog(gameId)
    }
    await loadAlertCatalogs()
  }

  /**
   * Saves a deck without holding up the UI. The main process applies saves in
   * the order they arrive, and every save carries the whole deck, so the
   * newest one always wins on disk. Only the server-assigned timestamps are
   * copied back — replacing the whole deck here could clobber a newer edit
   * that was applied while this save was in flight.
   */
  async function persistDeck(deck: Deck, options?: { keepUpdatedAt?: boolean }): Promise<void> {
    try {
      const saved = await window.api.decks.save(summarized(deck), options)
      set((s) => ({
        decks: s.decks.map((d) =>
          d.id === saved.id ? { ...d, createdAt: saved.createdAt, updatedAt: saved.updatedAt, ...(saved.summary ? { summary: saved.summary } : {}) } : d,
        ),
      }))
    } catch (err) {
      set({ error: t.store.saveFailed(deck.name, errorMessage(err)) })
    }
  }

  function currentCatalogById(gameId: GameId): Map<string, Card> {
    return get().catalogs[gameId]?.byId ?? new Map()
  }

  async function addAndSelectDeck(deck: Deck, undoLabel: string, viewing = false): Promise<void> {
    const saved = await window.api.decks.save(summarized(deck))
    set((s) => ({
      decks: [...s.decks, saved],
      currentDeckId: saved.id,
      currentGameId: saved.gameId,
      showWishlist: false,
      showCollection: false,
      showMyDecks: false,
      showTrade: false,
      showBinders: false,
      deckViewing: viewing,
    }))
    pushUndo({ kind: 'create', label: undoLabel, deckId: saved.id })
    persistSettings({ lastDeckId: saved.id, lastGameId: saved.gameId })
  }

  return { set, get, flags, persistSettings, pushUndo, summarized, recordValueOf, saveDetails, checkAlerts, loadAlertCatalogs, noteTradeMatches, checkTradeMatches, refreshAllPrices, persistDeck, currentCatalogById, addAndSelectDeck }
}
