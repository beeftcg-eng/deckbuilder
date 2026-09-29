import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  AppSettings,
  Binder,
  Card,
  CardCacheMeta,
  Collection,
  Deck,
  DeckCardEntry,
  DeckFreeTextEntry,
  DeckViewMode,
  Format,
  GameId,
  PairingsConfig,
  PairingsLink,
  PairingsResult,
  PawmodoroConfig,
  SharedDeck,
  SyncProgress,
  TradeMatch,
  TraderProfile,
  WishlistEntry,
} from '../shared/types'
import { GAME_LIST, getAdapter } from '../shared/games/registry'
import { buildPoolIndex, gameIdOfCardId, missingForDeck, totalPrice } from '../shared/collection'
import { localDay, recordValue, type ValueHistory } from '../shared/valueHistory'
import { checkPriceAlerts } from '../shared/priceAlerts'
import { askToNotify, notify } from '../lib/notify'
import { buildTradeCollection, buildTradeWants } from '../shared/trade'
import { parseDecklistText, type ParsedDeck } from '../shared/importDeck'
import { SAMPLE_DECKS } from '../shared/sampleDecks'
import { cheapestPrinting } from '../shared/buyList'
import { checkDeckLegality } from '../shared/legality'
import { freshTradeMatches } from '../shared/tradeAlerts'
import { changePull, type PackOpening } from '../shared/packOpenings'
import { moveOneCopy, withQuantity } from '../shared/deckEdits'
import type { UpdateStatus } from '../shared/updateStatus'
import { currentDeckFor } from '../shared/decks'
import { parseShareToken } from '../shared/deckShare'
import { displayCurrency, formatMoney, setDisplayCurrency, type RatesFile } from '../shared/currency'
import { PRICE_FILES_URL } from '../shared/priceKeys'
import { fetchJson } from '../shared/games/fetchUtil'

/** Today's exchange rates, published with the price files (scripts/build-prices.ts). Null when unreachable. */
async function loadExchangeRates(): Promise<RatesFile | null> {
  try {
    const file = await fetchJson<RatesFile>(`${PRICE_FILES_URL}/rates.json`, 3)
    return file && typeof file.rates === 'object' ? file : null
  } catch {
    return null
  }
}
import { applyVisibleOrder, reorderByDrop, type DeckSortMode } from '../shared/deckOrder'
import { orderGames } from '../shared/gameOrder'
import { applyTheme } from '../lib/theme'
import { withListHash, withSummary } from '../shared/deckSummary'
import { staleIdRepairs, storedCardIds } from '../shared/cardIdRepair'
import { applyArtChoices, printingKey, withArtwork } from '../shared/artChoice'
import { addToBinder, addToDeck, deckMoveProblem, takeFromBinder, takeFromDeck, zoneForCard, type MoveEnd } from '../shared/cardMoves'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../shared/pawmodoroDefaults'
import { getLanguage, isLanguage, t, zoneLabel, type Language } from '../shared/i18n'
import { applyLanguage } from '../lib/language'

interface Catalog {
  cards: Card[]
  byId: Map<string, Card>
}

type Catalogs = Partial<Record<GameId, Catalog>>

export type ImportBackupResult = Awaited<ReturnType<typeof window.api.backup.import>>

/** One reversible change. Undo pops the newest and puts things back as they were. */
type UndoEntry =
  | { kind: 'edit'; label: string; before: Deck }
  | { kind: 'delete'; label: string; deck: Deck }
  | { kind: 'create'; label: string; deckId: string }

const MAX_UNDO = 100

function emptyDeck(gameId: GameId, formatId: string): Deck {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    gameId,
    name: t.store.newDeck,
    formatId,
    zones: {},
    freeTextZones: {},
    createdAt: now,
    updatedAt: now,
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function lookupIn(catalogs: Catalogs): (cardId: string) => Card | undefined {
  return (cardId) => {
    const gameId = gameIdOfCardId(cardId)
    return gameId ? catalogs[gameId]?.byId.get(cardId) : undefined
  }
}

/** Copies you own per card pool (see collection.ts poolKey), across all printings. */
export function ownedIndexOf(collection: Collection, catalogs: Catalogs): Map<string, number> {
  return buildPoolIndex(
    Object.entries(collection).map(([cardId, quantity]) => ({ cardId, quantity })),
    lookupIn(catalogs),
  )
}

export function wishlistIndexOf(wishlist: WishlistEntry[], catalogs: Catalogs): Map<string, number> {
  return buildPoolIndex(wishlist, lookupIn(catalogs))
}

interface AppState {
  currentGameId: GameId
  catalogs: Catalogs
  syncMeta: Partial<Record<GameId, CardCacheMeta>>
  syncProgress: Partial<Record<GameId, SyncProgress>>
  formats: Partial<Record<GameId, Format[]>>
  decks: Deck[]
  currentDeckId: string | null
  showWishlist: boolean
  showCollection: boolean
  settings: AppSettings
  undoStack: UndoEntry[]
  /** Self-update progress, pushed from the main process; null until it has reported. */
  updateStatus: UpdateStatus | null
  /** Last failure worth telling the user about (e.g. a save that didn't go through). */
  error: string | null
  /** A good-news message (e.g. cards restored after a card-data change), shown until dismissed. */
  notice: string | null
  setNotice: (message: string | null) => void
  /** Shows `artId` for this Yu-Gi-Oh printing everywhere (null = its default artwork) - see artChoice.ts. */
  setArtChoice: (card: Card, artId: string | null) => void

  wishlist: WishlistEntry[]
  collection: Collection
  pawmodoroConfig: PawmodoroConfig
  pushingWishlist: boolean

  initialize: () => Promise<void>
  setError: (message: string | null) => void
  setGame: (gameId: GameId) => void
  loadMeta: (gameId: GameId) => Promise<void>
  loadCatalog: (gameId: GameId) => Promise<void>
  syncCatalog: (gameId: GameId) => Promise<void>
  loadFormats: (gameId: GameId) => Promise<void>
  saveFormats: (gameId: GameId, formats: Format[]) => Promise<void>
  loadDecks: () => Promise<void>
  createDeck: (gameId: GameId) => Promise<void>
  duplicateDeck: (deckId: string) => Promise<void>
  importDeck: (gameId: GameId, parsed: ParsedDeck, name: string, formatId: string) => Promise<void>
  selectDeck: (deckId: string | null) => void
  deleteDeck: (deckId: string) => Promise<void>
  updateDeck: (updater: (deck: Deck) => Deck, undoLabel?: string) => Promise<void>
  setCardQuantity: (zoneId: string, card: Card, quantity: number) => Promise<void>
  setFreeTextQuantity: (zoneId: string, label: string, quantity: number) => Promise<void>
  /** Moves one copy of a card between two zones of the open deck (e.g. main deck → sideboard), as one undoable edit. */
  moveCard: (fromZoneId: string, toZone: { id: string; label: string }, card: Card) => Promise<void>
  /** Reorders cards within one zone of the open deck (a drag-and-drop), as one undoable edit. */
  reorderDeckEntries: (zoneId: string, dragCardId: string, targetCardId: string, position: 'before' | 'after') => Promise<void>
  undo: () => Promise<void>
  setDeckSort: (sort: DeckSortMode) => void
  /** Saves a new order for the decks on screen (one game's list) and switches the list to that custom order. */
  reorderDecks: (visibleIds: string[]) => void
  showMyDecks: boolean
  setShowMyDecks: (show: boolean) => void

  /** Named, cross-game groups of owned cards (see shared/types.ts's Binder) - separate from the single flat `collection`. */
  binders: Binder[]
  /** The binder quick-add steppers on card tiles target, if any - set by opening/creating a binder in the Binders panel. */
  currentBinderId: string | null
  showBinders: boolean
  setShowBinders: (show: boolean) => void
  loadBinders: () => Promise<void>
  createBinder: (name?: string) => Promise<void>
  duplicateBinder: (binderId: string) => Promise<void>
  renameBinder: (binderId: string, name: string) => Promise<void>
  deleteBinder: (binderId: string) => Promise<void>
  /** Sets the active binder for quick-add steppers, or null to stop targeting one. */
  selectBinder: (binderId: string | null) => void
  setBinderCardQuantity: (binderId: string, cardId: string, quantity: number) => Promise<void>
  /** Moves copies of a card between binders and decks, in any direction (a deck target gets the zone the
   * card browser would pick). The collection doesn't change. Returns whether anything moved. */
  moveCards: (from: MoveEnd, to: MoveEnd, card: Card, quantity: number) => Promise<boolean>
  /** Whether the open deck is shown as the read-only full view (the default when a deck is selected) rather than in the editor. */
  deckViewing: boolean
  setDeckViewing: (viewing: boolean) => void
  /** Locks a deck so it can't be changed or deleted, or unlocks it. Not an edit itself, so it isn't undoable. */
  setDeckLocked: (deckId: string, locked: boolean) => Promise<void>
  /** Records (or clears) a deck's share-link token. Not an edit, so it isn't undoable and works on a locked deck. */
  setDeckShareToken: (deckId: string, token: string | null) => Promise<void>
  /** Saves a deck's notes. Works on a locked deck too: notes aren't the list. */
  setDeckNotes: (deckId: string, notes: string) => Promise<void>
  /** Files a deck under a folder ('' takes it out). Works on a locked deck: it's filing, not the list. */
  setDeckFolder: (deckId: string, folder: string) => Promise<void>
  /** The phone app's card scanner (ScannerModal.tsx), opened from Collection or the menu. */
  showScanner: boolean
  setShowScanner: (show: boolean) => void
  /** A deck someone shared by link (?share=<token>), shown over everything else until closed. */
  sharedDeck: SharedDeck | null
  sharedDeckState: 'loading' | 'ready' | 'dead' | 'error' | null
  sharedDeckError: string | null
  openSharedLink: (token: string) => Promise<void>
  closeSharedDeck: () => void
  /** Saves the shared deck as a new deck of your own and opens it. */
  copySharedDeck: () => Promise<void>
  /** Opens the game's example deck (sampleDecks.ts) read-only, the way a share link opens: to try things on, or copy. Needs the game's cards loaded. */
  openExampleDeck: (gameId: GameId) => void
  /** The pack opening being filled in, if any: the scanner can add its cards to it. */
  activeOpeningId: string | null
  /** The keyboard shortcuts list (desktop). */
  showShortcuts: boolean
  setShowShortcuts: (show: boolean) => void
  setActiveOpening: (id: string | null) => void
  /** Adds or replaces an opening (packOpenings.ts). */
  savePackOpening: (opening: PackOpening) => void
  /** Forgets an opening. Its cards stay in the collection. */
  deletePackOpening: (id: string) => void
  /** One more (or fewer) of a card in an opening, and in the collection too when the opening adds its pulls there. */
  changePackPull: (openingId: string, cardId: string, delta: number) => Promise<void>
  /** Saves the order of the game tabs in the sidebar. */
  setGameOrder: (order: GameId[]) => void
  /** Shows or hides a game's tab in the sidebar. Never lets the last visible game be hidden, and switches off a game you're hiding. */
  setGameHidden: (gameId: GameId, hidden: boolean) => void
  /** Opens a deck from anywhere (the My Decks page): switches to its game, selects it, and shows the deck panel. */
  openDeck: (deckId: string) => void
  setDeckViewMode: (mode: DeckViewMode) => void
  setUpdateStatus: (status: UpdateStatus) => void
  setTheme: (id: string) => void
  /** Shows prices in this currency (converted from US dollars at the day's rate). */
  setCurrency: (code: string) => void
  /** Saves today's collection value for a game whose cards are loaded (valueHistory.ts). */
  recordCollectionValue: (gameId: GameId) => void
  /** Sets (US dollars) or clears (null) the price alert on a wishlisted card (priceAlerts.ts). */
  setPriceAlert: (cardId: string, targetUsd: number | null) => void
  /** Changes whenever the currency or its rate does, so price text re-renders (App.tsx keys on it). */
  currencyKey: string
  /** The welcome tour (WelcomeTour.tsx): opens by itself on a first launch, or from the sidebar. */
  showTour: boolean
  setShowTour: (show: boolean) => void
  /** The UI language. Changing it re-mounts the screens (App.tsx) so every string picks it up. */
  language: Language
  setLanguage: (language: Language) => void
  /** Picks (or, with null, clears) the open deck's icon card. */
  setDeckIcon: (cardId: string | null) => Promise<void>
  applySyncProgress: (progress: SyncProgress) => void

  setShowWishlist: (show: boolean) => void
  setShowCollection: (show: boolean) => void
  loadWishlist: () => Promise<void>
  addToWishlist: (card: Card, quantity?: number) => Promise<void>
  addDeckToWishlist: (deck: Deck) => Promise<number>
  wishlistMissing: (deck: Deck) => Promise<number>
  setWishlistQuantity: (entryId: string, quantity: number) => Promise<void>
  removeFromWishlist: (entryId: string) => Promise<void>

  loadCollection: () => Promise<void>
  /** Adds (or, if negative, removes) copies of one printing. Relative, so quick repeat clicks can't overwrite each other. */
  changeOwned: (cardId: string, delta: number) => Promise<void>
  /** Adds copies of several printings at once (relative, like changeOwned). Returns the copies added. */
  addToCollection: (items: { cardId: string; quantity: number }[]) => Promise<number>
  /** Wishlists one copy of each card; the ones already on the wishlist are the caller's to leave out. */
  wishlistCards: (cards: Card[]) => Promise<number>
  markDeckOwned: (deck: Deck) => Promise<number>
  markGotIt: (entryId: string) => Promise<void>

  loadPawmodoroConfig: () => Promise<void>
  connectPawmodoro: (url: string, anonKey: string, email: string, password: string, signUp?: boolean) => Promise<void>
  disconnectPawmodoro: () => Promise<void>
  pushWishlistToPawmodoro: (items: { entryId: string; text: string }[]) => Promise<{ pushedCount: number; failedCount: number }>

  /** The Pairings (tournament tracker) login - a separate account from Pawmodoro's. */
  pairingsConfig: PairingsConfig
  /** Results logged in Pairings, by Brewhouse deck id; null until fetched. */
  pairingsRecords: Record<string, PairingsResult[]> | null
  /** Every deck linked in Pairings, by Brewhouse deck id: the card list it last synced (for the sync reminder). */
  pairingsLinks: Record<string, PairingsLink> | null
  pairingsLoading: boolean
  pairingsError: string | null
  loadPairingsConfig: () => Promise<void>
  connectPairings: (email: string, password: string) => Promise<void>
  disconnectPairings: () => Promise<void>
  /** Fetches your Pairings results. `ifOlderThanMs` skips it when the last fetch is more recent than that. */
  loadPairingsRecords: (options?: { ifOlderThanMs?: number }) => Promise<void>

  showTrade: boolean
  setShowTrade: (show: boolean) => void
  /** Card ids from `collection` currently marked "for trade" — separate from quantity, see electron/lib/paths.ts forTradeFile. */
  forTrade: Set<string>
  loadForTrade: () => Promise<void>
  toggleForTrade: (cardId: string) => Promise<void>
  /** Turns your profile public/private (and sets the name shown while browsing); public turns on an immediate sync. */
  setTradeVisibility: (isPublic: boolean, displayName: string) => Promise<void>
  tradeSyncing: boolean
  /** Pushes your current collection/for-trade flags and wishlist to the cloud, for Browse/Matches to see. No-ops while private. */
  syncTradeData: () => Promise<{ skipped: number }>
  browseTraders: TraderProfile[]
  loadBrowseTraders: () => Promise<void>
  tradeMatches: TradeMatch[]
  loadTradeMatches: () => Promise<void>

  exportBackup: () => Promise<boolean>
  importBackup: () => Promise<ImportBackupResult>
}

export const useAppStore = create<AppState>((set, get) => {
  function persistSettings(patch: AppSettings) {
    window.api.settings
      .set(patch)
      .then((settings) => set({ settings }))
      .catch((err) => console.error("Couldn't save settings:", err))
  }

  function pushUndo(entry: UndoEntry) {
    set((s) => ({ undoStack: [...s.undoStack, entry].slice(-MAX_UNDO) }))
  }

  /**
   * Saves a deck without holding up the UI. The main process applies saves in
   * the order they arrive, and every save carries the whole deck, so the
   * newest one always wins on disk. Only the server-assigned timestamps are
   * copied back — replacing the whole deck here could clobber a newer edit
   * that was applied while this save was in flight.
   */
  /** When Pairings results were last fetched (ms), so coming back to the window doesn't refetch every time. */
  let pairingsFetchedAt = 0

  /** The deck with its readable summary refreshed, when its game's cards are loaded (see deckSummary.ts). */
  function summarized(deck: Deck): Deck {
    const catalog = get().catalogs[deck.gameId]
    if (!catalog) return withListHash(deck)
    const formats = get().formats[deck.gameId] ?? getAdapter(deck.gameId).defaultFormats
    return withSummary(deck, catalog.byId, formats.find((f) => f.id === deck.formatId)?.label ?? null)
  }

  /** Set once the collection and wishlist are loaded at startup: collection values and price alerts need them. */
  let startupLoaded = false
  let valueSaveTimer: ReturnType<typeof setTimeout> | undefined
  /** The newest value history while its save waits (another settings save meanwhile returns the older one). */
  let pendingValues: ValueHistory | null = null

  function recordValueOf(gameId: GameId) {
    const catalog = get().catalogs[gameId]
    if (!startupLoaded || !catalog || !getAdapter(gameId).hasPrices) return
    const items: { card: Card; quantity: number }[] = []
    for (const [cardId, copies] of Object.entries(get().collection)) {
      if (gameIdOfCardId(cardId) !== gameId) continue
      const card = catalog.byId.get(cardId)
      if (card) items.push({ card, quantity: copies })
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

  /** Price alerts against the prices loaded now: the ones that just went off are shown (and notified). */
  function checkAlerts() {
    if (!startupLoaded) return
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
    if (!startupLoaded || !get().settings.tradeProfile?.public) return
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

  return {
    currentGameId: 'riftbound',
    catalogs: {},
    syncMeta: {},
    syncProgress: {},
    formats: {},
    decks: [],
    currentDeckId: null,
    binders: [],
    currentBinderId: null,
    showBinders: false,
    showWishlist: false,
    showCollection: false,
    showMyDecks: false,
    showTrade: false,
    deckViewing: false,
    settings: {},
    undoStack: [],
    error: null,
    notice: null,
    updateStatus: null,

    wishlist: [],
    collection: {},
    pawmodoroConfig: { url: DEFAULT_PAWMODORO_URL, anonKey: DEFAULT_PAWMODORO_ANON_KEY, email: '', connected: false },
    pushingWishlist: false,
    pairingsConfig: { email: '', connected: false },
    pairingsRecords: null,
    pairingsLinks: null,
    pairingsLoading: false,
    pairingsError: null,
    forTrade: new Set(),
    language: getLanguage(),
    showTour: false,
    showScanner: false,
    currencyKey: 'USD',
    sharedDeck: null,
    activeOpeningId: null,
    showShortcuts: false,
    sharedDeckState: null,
    sharedDeckError: null,
    tradeSyncing: false,
    browseTraders: [],
    tradeMatches: [],

    initialize: async () => {
      try {
        const [decks, settings] = await Promise.all([window.api.decks.list(), window.api.settings.get()])
        set({ decks, settings })
        applyTheme(settings.theme)
        // Prices: the picked currency with the last known rate straight away, fresher rates in the background.
        const currency = settings.currency ?? (typeof navigator !== 'undefined' && /^es-MX/i.test(navigator.language) ? 'MXN' : 'USD')
        setDisplayCurrency(currency, settings.currencyRates?.rates)
        set({ currencyKey: `${displayCurrency()}:${settings.currencyRates?.updatedAt ?? ''}` })
        void loadExchangeRates().then((file) => {
          if (!file || file.updatedAt === get().settings.currencyRates?.updatedAt) return
          const currencyRates = { updatedAt: file.updatedAt, rates: file.rates }
          setDisplayCurrency(get().settings.currency ?? currency, currencyRates.rates)
          set((s) => ({ settings: { ...s.settings, currencyRates }, currencyKey: `${displayCurrency()}:${file.updatedAt}` }))
          persistSettings({ currencyRates })
        })
        // A first launch (no decks, never toured) opens the tour. Someone who already has decks can
        // start it from the sidebar instead of having it pop up after an update.
        // Not over a share link, though: a friend opening one came to see that deck.
        const openingShareLink = typeof location !== 'undefined' && new URLSearchParams(location.search).has('share')
        if (!settings.tourSeen && decks.length === 0 && !openingShareLink) set({ showTour: true })
        if (isLanguage(settings.language) && settings.language !== get().language) {
          applyLanguage(settings.language)
          set({ language: settings.language })
        }

        // Open the deck a link names (Pairings' "Open in Brewhouse" goes to the phone app with ?deck=<id>),
        // else reopen where you left off: the last deck (which also implies its game), else the last game.
        const params = typeof location === 'undefined' ? null : new URLSearchParams(location.search)
        const linkedDeckId = params?.get('deck') ?? null
        // A share link (?share=<token>, see deckShare.ts) opens that deck over everything else.
        const shareToken = params ? parseShareToken(`?share=${params.get('share') ?? ''}`) : null
        if (linkedDeckId || params?.has('share')) history.replaceState(null, '', location.pathname + location.hash)
        if (shareToken) void get().openSharedLink(shareToken)
        const lastDeck = decks.find((d) => d.id === linkedDeckId) ?? decks.find((d) => d.id === settings.lastDeckId)
        if (lastDeck) set({ currentDeckId: lastDeck.id, currentGameId: lastDeck.gameId, deckViewing: true })
        else if (settings.lastGameId) set({ currentGameId: settings.lastGameId })

        await Promise.all([
          get().loadWishlist(),
          get().loadCollection(),
          get().loadForTrade(),
          get().loadBinders(),
          ...GAME_LIST.map((adapter) => get().loadMeta(adapter.id)),
          ...GAME_LIST.map((adapter) => get().loadFormats(adapter.id)),
        ])

        startupLoaded = true
        for (const gameId of Object.keys(get().catalogs) as GameId[]) recordValueOf(gameId)
        checkAlerts()

        // Prices: today's are applied to every downloaded game in the background (no re-download),
        // and again when you come back to the app after a while.
        void refreshAllPrices()
        void checkTradeMatches()
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return
            void refreshAllPrices()
            void checkTradeMatches()
          })
        }

        // Pairings results: fetched once in the background, then again when you come back to the
        // window (a result logged in Pairings meanwhile shows up), at most once a minute.
        void get()
          .loadPairingsConfig()
          .then(() => get().loadPairingsRecords())
          .catch(() => undefined)
        const refreshPairings = () => {
          if (document.visibilityState === 'visible') void get().loadPairingsRecords({ ifOlderThanMs: 60_000 })
        }
        window.addEventListener('focus', refreshPairings)
        document.addEventListener('visibilitychange', refreshPairings)
      } catch (err) {
        set({ error: t.store.loadFailed(errorMessage(err)) })
      }
    },

    setError: (message) => set({ error: message }),
    setNotice: (message) => set({ notice: message }),

    setArtChoice: (card, artId) => {
      const key = printingKey(card)
      const choices = { ...(get().settings.artChoices ?? {}) }
      if (artId) choices[key] = artId
      else delete choices[key]
      set((s) => {
        const catalog = s.catalogs[card.gameId]
        const settings = { ...s.settings, artChoices: choices }
        if (!catalog) return { settings }
        const cards = catalog.cards.map((c) => (c.gameId === 'yugioh' && printingKey(c) === key ? withArtwork(c, artId) : c))
        return { settings, catalogs: { ...s.catalogs, [card.gameId]: { cards, byId: new Map(cards.map((c) => [c.id, c])) } } }
      })
      persistSettings({ artChoices: choices })
    },

    setGame: (gameId) => {
      set({ currentGameId: gameId })
      persistSettings({ lastGameId: gameId })
    },

    loadMeta: async (gameId) => {
      const meta = await window.api.cards.meta(gameId)
      set((s) => ({ syncMeta: { ...s.syncMeta, [gameId]: meta } }))
    },

    loadCatalog: async (gameId) => {
      const cards = applyArtChoices(await window.api.cards.load(gameId), get().settings.artChoices)
      const byId = new Map(cards.map((c) => [c.id, c]))
      set((s) => ({ catalogs: { ...s.catalogs, [gameId]: { cards, byId } } }))
      // Card ids saved against older card data (Yu-Gi-Oh's changed in v0.12.0) are pointed at the current
      // cards, so decks, binders, the collection and the wishlist don't lose them - see cardIdRepair.ts.
      if (gameId === 'yugioh') {
        try {
          // Read from the saved files, not the store: at startup this can run before binders, the
          // collection and the wishlist have been loaded into it, and their stale ids would be missed.
          const [decks, binders, collection, wishlist] = await Promise.all([
            window.api.decks.list(),
            window.api.binders.list(),
            window.api.collection.get(),
            window.api.wishlist.list(),
          ])
          const repairs = staleIdRepairs(storedCardIds({ decks, binders, collection, wishlist }), cards)
          if (repairs.size > 0) {
            const fixed = await window.api.repairCardIds([...repairs])
            if (fixed.repaired > 0) {
              // Reload from the repaired files, so a startup load that read them earlier can't leave old ids on screen.
              await Promise.all([get().loadDecks(), get().loadBinders(), get().loadCollection(), get().loadForTrade(), get().loadWishlist()])
              set({
                notice: t.store.ygoRestored(fixed.repaired),
              })
            }
          }
        } catch (err) {
          set({ error: t.store.ygoRestoreFailed(errorMessage(err)) })
        }
      }
      recordValueOf(gameId)
      checkAlerts()
      // Decks saved before summaries existed get one now, without counting as an edit. Each deck is
      // read from the store right before its save is issued, so this never saves over a newer edit.
      for (const { id } of get().decks.filter((d) => d.gameId === gameId && !d.summary)) {
        const deck = get().decks.find((d) => d.id === id)
        if (!deck || deck.summary || !summarized(deck).summary) continue
        await persistDeck(deck, { keepUpdatedAt: true })
      }
    },

    syncCatalog: async (gameId) => {
      const meta = await window.api.cards.sync(gameId)
      set((s) => ({ syncMeta: { ...s.syncMeta, [gameId]: meta } }))
      await get().loadCatalog(gameId)
    },

    loadFormats: async (gameId) => {
      const formats = await window.api.formats.list(gameId)
      set((s) => ({ formats: { ...s.formats, [gameId]: formats } }))
    },

    saveFormats: async (gameId, formats) => {
      const saved = await window.api.formats.save(gameId, formats)
      set((s) => ({ formats: { ...s.formats, [gameId]: saved } }))
    },

    loadDecks: async () => {
      const decks = await window.api.decks.list()
      set({ decks })
    },

    createDeck: async (gameId) => {
      let formats = get().formats[gameId]
      if (!formats) {
        await get().loadFormats(gameId)
        formats = get().formats[gameId]
      }
      const formatId = formats?.[0]?.id ?? getAdapter(gameId).defaultFormats[0].id
      await addAndSelectDeck(emptyDeck(gameId, formatId), t.store.createDeck)
    },

    duplicateDeck: async (deckId) => {
      const source = get().decks.find((d) => d.id === deckId)
      if (!source) return
      const now = new Date().toISOString()
      // A copy is for editing, so it starts unlocked, and it isn't shared by the original's link.
      const { locked: _wasLocked, shareToken: _wasShared, ...unlocked } = structuredClone(source)
      const copy: Deck = { ...unlocked, id: crypto.randomUUID(), name: `${source.name} (copy)`, createdAt: now, updatedAt: now }
      await addAndSelectDeck(copy, `Duplicate "${source.name}"`)
    },

    importDeck: async (gameId, parsed, name, formatId) => {
      const deck: Deck = { ...emptyDeck(gameId, formatId), name, zones: parsed.zones, freeTextZones: parsed.freeTextZones }
      await addAndSelectDeck(deck, `Import "${name}"`, true)
    },

    selectDeck: (deckId) => {
      set({ currentDeckId: deckId, deckViewing: true })
      persistSettings({ lastDeckId: deckId })
    },

    deleteDeck: async (deckId) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      if (deck.locked) {
        set({ error: t.store.lockedNoDelete(deck.name) })
        return
      }
      set((s) => ({
        decks: s.decks.filter((d) => d.id !== deckId),
        currentDeckId: s.currentDeckId === deckId ? null : s.currentDeckId,
      }))
      pushUndo({ kind: 'delete', label: t.store.deleteDeck(deck.name), deck })
      try {
        await window.api.decks.delete(deckId)
      } catch (err) {
        set((s) => ({ decks: [...s.decks, deck], error: t.store.deleteFailed(deck.name, errorMessage(err)) }))
      }
    },

    setShowBinders: (show) => set(show ? { showBinders: true, showWishlist: false, showCollection: false, showMyDecks: false, showTrade: false } : { showBinders: false }),

    loadBinders: async () => {
      const binders = await window.api.binders.list()
      set({ binders })
    },

    createBinder: async (name) => {
      const now = new Date().toISOString()
      const binder: Binder = { id: crypto.randomUUID(), name: name?.trim() || t.binders.defaultName, cards: {}, createdAt: now, updatedAt: now }
      const saved = await window.api.binders.save(binder)
      set((s) => ({ binders: [...s.binders, saved], currentBinderId: saved.id }))
    },

    duplicateBinder: async (binderId) => {
      const source = get().binders.find((b) => b.id === binderId)
      if (!source) return
      const now = new Date().toISOString()
      const copy: Binder = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} (copy)`, createdAt: now, updatedAt: now }
      const saved = await window.api.binders.save(copy)
      set((s) => ({ binders: [...s.binders, saved], currentBinderId: saved.id }))
    },

    renameBinder: async (binderId, name) => {
      const binder = get().binders.find((b) => b.id === binderId)
      const trimmed = name.trim()
      if (!binder || !trimmed || trimmed === binder.name) return
      const saved = await window.api.binders.save({ ...binder, name: trimmed })
      set((s) => ({ binders: s.binders.map((b) => (b.id === saved.id ? saved : b)) }))
    },

    deleteBinder: async (binderId) => {
      const binder = get().binders.find((b) => b.id === binderId)
      if (!binder) return
      set((s) => ({
        binders: s.binders.filter((b) => b.id !== binderId),
        currentBinderId: s.currentBinderId === binderId ? null : s.currentBinderId,
      }))
      try {
        await window.api.binders.delete(binderId)
      } catch (err) {
        set((s) => ({ binders: [...s.binders, binder], error: t.store.deleteFailed(binder.name, errorMessage(err)) }))
      }
    },

    selectBinder: (binderId) => set({ currentBinderId: binderId }),

    setBinderCardQuantity: async (binderId, cardId, quantity) => {
      const binder = get().binders.find((b) => b.id === binderId)
      if (!binder) return
      const cards = { ...binder.cards }
      if (quantity > 0) cards[cardId] = quantity
      else delete cards[cardId]
      const saved = await window.api.binders.save({ ...binder, cards })
      set((s) => ({ binders: s.binders.map((b) => (b.id === saved.id ? saved : b)) }))
    },

    moveCards: async (from, to, card, quantity) => {
      const { binders, decks } = get()
      if (from.kind === to.kind && from.id === to.id) return false
      const fail = (message: string) => {
        set({ error: message })
        return false
      }
      const fromBinder = from.kind === 'binder' ? binders.find((b) => b.id === from.id) : undefined
      const fromDeck = from.kind === 'deck' ? decks.find((d) => d.id === from.id) : undefined
      const toBinder = to.kind === 'binder' ? binders.find((b) => b.id === to.id) : undefined
      const toDeck = to.kind === 'deck' ? decks.find((d) => d.id === to.id) : undefined
      if ((!fromBinder && !fromDeck) || (!toBinder && !toDeck)) return false
      if (fromDeck?.locked) return fail(t.store.lockedNoMoveOut(fromDeck.name))
      if (toDeck) {
        const problem = deckMoveProblem(toDeck, card)
        if (problem) return fail(problem)
      }

      const fromZoneId = from.kind === 'deck' ? from.zoneId : undefined
      const available = fromBinder
        ? (fromBinder.cards[card.id] ?? 0)
        : (fromDeck!.zones[fromZoneId ?? '']?.find((e) => e.cardId === card.id)?.quantity ?? 0)
      const n = Math.min(Math.floor(quantity), available)
      if (n <= 0) return false

      const nextBinders = new Map<string, Binder>()
      const nextDecks = new Map<string, Deck>()
      if (fromBinder) nextBinders.set(fromBinder.id, takeFromBinder(fromBinder, card.id, n))
      if (fromDeck) nextDecks.set(fromDeck.id, takeFromDeck(fromDeck, fromZoneId!, card.id, n))
      if (toBinder) nextBinders.set(toBinder.id, addToBinder(nextBinders.get(toBinder.id) ?? toBinder, card.id, n))
      if (toDeck) {
        const base = nextDecks.get(toDeck.id) ?? toDeck
        nextDecks.set(toDeck.id, addToDeck(base, zoneForCard(toDeck, card)!.id, card.id, n))
      }
      set((s) => ({
        binders: s.binders.map((b) => nextBinders.get(b.id) ?? b),
        decks: s.decks.map((d) => nextDecks.get(d.id) ?? d),
      }))
      // Not on the undo stack: undo only restores decks, so it would lose the binder side of a move.
      for (const deck of nextDecks.values()) await persistDeck(deck)
      try {
        for (const binder of nextBinders.values()) {
          const saved = await window.api.binders.save(binder)
          set((s) => ({ binders: s.binders.map((b) => (b.id === saved.id ? saved : b)) }))
        }
      } catch (err) {
        set({ error: t.store.binderSaveFailed(card.name, errorMessage(err)) })
      }
      return true
    },

    updateDeck: async (updater, undoLabel = t.store.editDeck) => {
      const { currentDeckId, currentGameId, decks } = get()
      const current = currentDeckFor(decks, currentDeckId, currentGameId)
      if (!current) return
      if (current.locked) {
        set({ error: t.store.lockedNoChange(current.name) })
        return
      }
      const next = updater(current)
      if (next === current) return
      // Applied to the store immediately, so a second click a few ms later builds on
      // this edit instead of on the stale deck that was there before the save returned.
      set((s) => ({ decks: s.decks.map((d) => (d.id === next.id ? next : d)) }))
      pushUndo({ kind: 'edit', label: undoLabel, before: current })
      await persistDeck(next)
    },

    setCardQuantity: async (zoneId, card, quantity) => {
      const deck = currentDeckFor(get().decks, get().currentDeckId, get().currentGameId)
      const previous = deck?.zones[zoneId]?.find((e) => e.cardId === card.id)?.quantity ?? 0
      await get().updateDeck(
        (d) => {
          const nextEntries = withQuantity<DeckCardEntry>(d.zones[zoneId] ?? [], (e) => e.cardId === card.id, () => ({ cardId: card.id, quantity }), quantity)
          return { ...d, zones: { ...d.zones, [zoneId]: nextEntries } }
        },
        quantity > previous ? t.store.addCard(card.name) : t.store.removeCard(card.name),
      )
    },

    moveCard: async (fromZoneId, toZone, card) => {
      await get().updateDeck((d) => moveOneCopy(d, fromZoneId, toZone.id, card.id), t.store.moveCard(card.name, zoneLabel(toZone.label)))
    },

    reorderDeckEntries: async (zoneId, dragCardId, targetCardId, position) => {
      await get().updateDeck((d) => {
        const entries = d.zones[zoneId] ?? []
        const ids = entries.map((e) => e.cardId)
        const nextIds = reorderByDrop(ids, dragCardId, targetCardId, position)
        if (nextIds.join('|') === ids.join('|')) return d
        const byId = new Map(entries.map((e) => [e.cardId, e]))
        return { ...d, zones: { ...d.zones, [zoneId]: nextIds.map((id) => byId.get(id)!) } }
      }, t.store.reorderCards)
    },

    setFreeTextQuantity: async (zoneId, label, quantity) => {
      await get().updateDeck(
        (d) => {
          const nextEntries = withQuantity<DeckFreeTextEntry>(d.freeTextZones[zoneId] ?? [], (e) => e.label === label, () => ({ label, quantity }), quantity)
          return { ...d, freeTextZones: { ...d.freeTextZones, [zoneId]: nextEntries } }
        },
        t.store.change(label),
      )
    },

    undo: async () => {
      const entry = get().undoStack.at(-1)
      if (!entry) return
      const lockedNow = entry.kind === 'edit' ? get().decks.find((d) => d.id === entry.before.id)?.locked : entry.kind === 'create' ? get().decks.find((d) => d.id === entry.deckId)?.locked : false
      if (lockedNow) {
        // Leave the entry on the stack: unlocking the deck makes it undoable again.
        set({ error: t.store.lockedUndo })
        return
      }
      set((s) => ({ undoStack: s.undoStack.slice(0, -1) }))

      if (entry.kind === 'edit') {
        set((s) => ({ decks: s.decks.map((d) => (d.id === entry.before.id ? { ...entry.before } : d)) }))
        await persistDeck(entry.before)
      } else if (entry.kind === 'delete') {
        set((s) => ({ decks: [...s.decks, entry.deck], currentDeckId: entry.deck.id, currentGameId: entry.deck.gameId, showWishlist: false, showCollection: false, showMyDecks: false, showTrade: false, showBinders: false }))
        await persistDeck(entry.deck)
      } else {
        set((s) => ({
          decks: s.decks.filter((d) => d.id !== entry.deckId),
          currentDeckId: s.currentDeckId === entry.deckId ? null : s.currentDeckId,
        }))
        try {
          await window.api.decks.delete(entry.deckId)
        } catch (err) {
          set({ error: t.store.undoFailed(errorMessage(err)) })
        }
      }
    },

    setDeckSort: (sort) => persistSettings({ deckSort: sort }),
    reorderDecks: (visibleIds) => {
      const patch: AppSettings = { deckSort: 'custom', deckOrder: applyVisibleOrder(get().settings.deckOrder ?? [], visibleIds) }
      set((s) => ({ settings: { ...s.settings, ...patch } })) // the list follows the drop at once; the save follows
      persistSettings(patch)
    },
    setDeckViewing: (viewing) => set({ deckViewing: viewing }),
    setDeckLocked: async (deckId, locked) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck || Boolean(deck.locked) === locked) return
      const { locked: _previous, ...rest } = deck
      const next: Deck = locked ? { ...rest, locked: true } : rest
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    setDeckShareToken: async (deckId, token) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck || (deck.shareToken ?? null) === token) return
      const { shareToken: _previous, ...rest } = deck
      const next: Deck = token ? { ...rest, shareToken: token } : rest
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    setDeckNotes: async (deckId, notes) => {
      const deck = get().decks.find((d) => d.id === deckId)
      const text = notes.replace(/\s+$/, '')
      if (!deck || (deck.notes ?? '') === text) return
      const { notes: _previous, ...rest } = deck
      const next: Deck = text ? { ...rest, notes: text } : rest
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    setDeckFolder: async (deckId, folder) => {
      const deck = get().decks.find((d) => d.id === deckId)
      const name = folder.trim().slice(0, 60)
      if (!deck || (deck.folder ?? '') === name) return
      const { folder: _previous, ...rest } = deck
      const next: Deck = name ? { ...rest, folder: name } : rest
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    openSharedLink: async (token) => {
      set({ sharedDeck: null, sharedDeckState: 'loading', sharedDeckError: null })
      try {
        const shared = await window.api.pawmodoro.getSharedDeck(token)
        if (get().sharedDeckState !== 'loading') return // closed while loading
        set(shared ? { sharedDeck: shared, sharedDeckState: 'ready' } : { sharedDeckState: 'dead' })
        if (shared && !get().catalogs[shared.deck.gameId] && (get().syncMeta[shared.deck.gameId]?.count ?? 0) > 0) {
          void get().loadCatalog(shared.deck.gameId)
        }
      } catch (err) {
        if (get().sharedDeckState === 'loading') set({ sharedDeckState: 'error', sharedDeckError: errorMessage(err) })
      }
    },
    closeSharedDeck: () => set({ sharedDeck: null, sharedDeckState: null, sharedDeckError: null }),
    setShowScanner: (show) => set({ showScanner: show }),
    setActiveOpening: (id) => set({ activeOpeningId: id }),
    setShowShortcuts: (show) => set({ showShortcuts: show }),
    savePackOpening: (opening) => {
      const current = get().settings.packOpenings ?? []
      const packOpenings = current.some((o) => o.id === opening.id) ? current.map((o) => (o.id === opening.id ? opening : o)) : [opening, ...current]
      set((s) => ({ settings: { ...s.settings, packOpenings } }))
      persistSettings({ packOpenings })
    },
    deletePackOpening: (id) => {
      const packOpenings = (get().settings.packOpenings ?? []).filter((o) => o.id !== id)
      set((s) => ({ settings: { ...s.settings, packOpenings }, activeOpeningId: s.activeOpeningId === id ? null : s.activeOpeningId }))
      persistSettings({ packOpenings })
    },
    changePackPull: async (openingId, cardId, delta) => {
      const opening = (get().settings.packOpenings ?? []).find((o) => o.id === openingId)
      if (!opening) return
      const before = opening.pulls.find((p) => p.cardId === cardId)?.quantity ?? 0
      const next = changePull(opening, cardId, delta)
      const after = next.pulls.find((p) => p.cardId === cardId)?.quantity ?? 0
      if (after === before) return
      get().savePackOpening(next)
      if (opening.addToCollection) await get().changeOwned(cardId, after - before)
    },
    openExampleDeck: (gameId) => {
      const catalog = get().catalogs[gameId]
      if (!catalog) return
      const sample = SAMPLE_DECKS[gameId]
      const parsed = parseDecklistText(sample.text, getAdapter(gameId), catalog.byId, sample.formatId)
      // The cheapest printing of each card, so the example shows what the list really costs (a name alone can land on a pricey promo).
      const zones = Object.fromEntries(
        Object.entries(parsed.zones).map(([zoneId, entries]) => {
          const merged = new Map<string, number>()
          for (const { cardId, quantity } of entries) {
            const card = catalog.byId.get(cardId)
            const id = card ? cheapestPrinting(card, catalog.cards).id : cardId
            merged.set(id, (merged.get(id) ?? 0) + quantity)
          }
          return [zoneId, [...merged].map(([cardId, quantity]) => ({ cardId, quantity }))]
        }),
      )
      const now = new Date().toISOString()
      const base: Deck = { ...emptyDeck(gameId, sample.formatId), id: `example-${gameId}`, name: sample.name, zones: parsed.zones, freeTextZones: parsed.freeTextZones, createdAt: now, updatedAt: now }
      // ...unless a cheaper reprint isn't legal in the format (One Piece rotates by set).
      const adapter = getAdapter(gameId)
      const format = (get().formats[gameId] ?? adapter.defaultFormats).find((f) => f.id === sample.formatId)
      const cheap = { ...base, zones }
      const deck = !format || checkDeckLegality(cheap, adapter, format, catalog.byId).legal || !checkDeckLegality(base, adapter, format, catalog.byId).legal ? cheap : base
      set({ sharedDeck: { token: '', deck, ownerName: null, updatedAt: now, example: true }, sharedDeckState: 'ready', sharedDeckError: null })
    },
    copySharedDeck: async () => {
      const shared = get().sharedDeck
      if (!shared) return
      const now = new Date().toISOString()
      // Someone else's folder means nothing in your lists (the server strips it too, see schema.sql).
      const { folder: _theirFolder, ...rest } = structuredClone(shared.deck)
      const copy: Deck = { ...rest, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      set({ sharedDeck: null, sharedDeckState: null, sharedDeckError: null })
      await addAndSelectDeck(copy, t.store.copySharedDeck(copy.name), true)
    },
    setGameOrder: (order) => {
      set((s) => ({ settings: { ...s.settings, gameOrder: order } }))
      persistSettings({ gameOrder: order })
    },
    setGameHidden: (gameId, hidden) => {
      const current = get().settings.hiddenGames ?? []
      if (hidden === current.includes(gameId)) return
      if (hidden && current.length >= GAME_LIST.length - 1) return // always leave at least one game visible
      const hiddenGames = hidden ? [...current, gameId] : current.filter((id) => id !== gameId)
      set((s) => ({ settings: { ...s.settings, hiddenGames } }))
      persistSettings({ hiddenGames })
      if (hidden && get().currentGameId === gameId) {
        const fallback = GAME_LIST.find((g) => !hiddenGames.includes(g.id))
        if (fallback) get().setGame(fallback.id)
      }
    },
    setShowMyDecks: (show) =>
      set(show ? { showMyDecks: true, showWishlist: false, showCollection: false, showTrade: false, showBinders: false } : { showMyDecks: false }),
    openDeck: (deckId) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      set({ currentGameId: deck.gameId, currentDeckId: deckId, showMyDecks: false, showWishlist: false, showCollection: false, showTrade: false, showBinders: false, deckViewing: true })
      persistSettings({ lastGameId: deck.gameId, lastDeckId: deckId })
    },
    setDeckViewMode: (mode) => persistSettings({ deckViewMode: mode }),
    setUpdateStatus: (status) => set({ updateStatus: status }),
    setDeckIcon: async (cardId) => {
      await get().updateDeck((d) => {
        const { iconCardId: _previous, ...rest } = d
        return cardId ? { ...rest, iconCardId: cardId } : rest
      }, cardId ? t.store.setIcon : t.store.clearIcon)
    },

    recordCollectionValue: (gameId) => recordValueOf(gameId),

    setPriceAlert: (cardId, targetUsd) => {
      const alerts = { ...get().settings.priceAlerts }
      if (targetUsd == null) delete alerts[cardId]
      else alerts[cardId] = { target: targetUsd }
      set((s) => ({ settings: { ...s.settings, priceAlerts: alerts } }))
      persistSettings({ priceAlerts: alerts })
      // Already at or below it: say so now rather than tomorrow.
      checkAlerts()
    },

    setCurrency: (code) => {
      const rates = get().settings.currencyRates?.rates
      setDisplayCurrency(code, rates)
      set((s) => ({ settings: { ...s.settings, currency: code }, currencyKey: `${displayCurrency()}:${s.settings.currencyRates?.updatedAt ?? ''}` }))
      persistSettings({ currency: code })
    },
    setTheme: (id) => {
      applyTheme(id) // instant; the saved copy follows
      persistSettings({ theme: id })
    },

    setShowTour: (show) => {
      set({ showTour: show })
      if (!show && !get().settings.tourSeen) {
        set((s) => ({ settings: { ...s.settings, tourSeen: true } }))
        persistSettings({ tourSeen: true })
      }
    },

    setLanguage: (language) => {
      applyLanguage(language)
      set({ language })
      persistSettings({ language })
    },

    applySyncProgress: (progress) => set((s) => ({ syncProgress: { ...s.syncProgress, [progress.gameId]: progress } })),

    setShowWishlist: (show) =>
      set(show ? { showWishlist: true, showCollection: false, showMyDecks: false, showTrade: false, showBinders: false } : { showWishlist: false }),
    setShowCollection: (show) =>
      set(show ? { showCollection: true, showWishlist: false, showMyDecks: false, showTrade: false, showBinders: false } : { showCollection: false }),
    setShowTrade: (show) =>
      set(show ? { showTrade: true, showWishlist: false, showCollection: false, showMyDecks: false, showBinders: false } : { showTrade: false }),

    loadWishlist: async () => {
      const wishlist = await window.api.wishlist.list()
      set({ wishlist })
    },

    addToWishlist: async (card, quantity = 1) => {
      const wishlist = await window.api.wishlist.add(card.gameId, card.id, quantity)
      set({ wishlist })
    },

    addDeckToWishlist: async (deck) => {
      // Only real cards (deck.zones) count — freeTextZones hold labels like
      // Riftbound rune requirements, not actual Card ids, so there's nothing
      // to look up or wishlist for those.
      const items = Object.values(deck.zones)
        .flat()
        .map((entry) => ({ gameId: deck.gameId, cardId: entry.cardId, quantity: entry.quantity }))
      if (items.length === 0) return 0
      const wishlist = await window.api.wishlist.addMany(items)
      set({ wishlist })
      return items.reduce((sum, item) => sum + item.quantity, 0)
    },

    wishlistMissing: async (deck) => {
      const { catalogs, collection, wishlist } = get()
      const missing = missingForDeck(deck, currentCatalogById(deck.gameId), ownedIndexOf(collection, catalogs), wishlistIndexOf(wishlist, catalogs))
      if (missing.length === 0) return 0
      const next = await window.api.wishlist.addMany(missing.map(({ card, quantity }) => ({ gameId: deck.gameId, cardId: card.id, quantity })))
      set({ wishlist: next })
      return missing.reduce((sum, m) => sum + m.quantity, 0)
    },

    setWishlistQuantity: async (entryId, quantity) => {
      const wishlist = await window.api.wishlist.setQuantity(entryId, quantity)
      set({ wishlist })
    },

    removeFromWishlist: async (entryId) => {
      const wishlist = await window.api.wishlist.remove(entryId)
      set({ wishlist })
    },

    loadCollection: async () => {
      const collection = await window.api.collection.get()
      set({ collection })
    },

    changeOwned: async (cardId, delta) => {
      const collection = await window.api.collection.add([{ cardId, quantity: delta }])
      set({ collection })
    },

    addToCollection: async (items) => {
      if (items.length === 0) return 0
      const collection = await window.api.collection.add(items)
      set({ collection })
      return items.reduce((sum, item) => sum + item.quantity, 0)
    },

    wishlistCards: async (cards) => {
      if (cards.length === 0) return 0
      const wishlist = await window.api.wishlist.addMany(cards.map((card) => ({ gameId: card.gameId, cardId: card.id, quantity: 1 })))
      set({ wishlist })
      return cards.length
    },

    markDeckOwned: async (deck) => {
      const { catalogs, collection } = get()
      const missing = missingForDeck(deck, currentCatalogById(deck.gameId), ownedIndexOf(collection, catalogs))
      if (missing.length === 0) return 0
      const next = await window.api.collection.add(missing.map(({ card, quantity }) => ({ cardId: card.id, quantity })))
      set({ collection: next })
      return missing.reduce((sum, m) => sum + m.quantity, 0)
    },

    markGotIt: async (entryId) => {
      const entry = get().wishlist.find((e) => e.id === entryId)
      if (!entry) return
      // Owned first: if this fails the card is still on the wishlist, never in neither place.
      const collection = await window.api.collection.add([{ cardId: entry.cardId, quantity: entry.quantity }])
      set({ collection })
      const wishlist = await window.api.wishlist.remove(entryId)
      set({ wishlist })
    },

    loadPawmodoroConfig: async () => {
      const pawmodoroConfig = await window.api.pawmodoro.getConfig()
      set({ pawmodoroConfig })
    },

    connectPawmodoro: async (url, anonKey, email, password, signUp = false) => {
      const pawmodoroConfig = await window.api.pawmodoro.connect(url, anonKey, email, password, signUp)
      set({ pawmodoroConfig })
    },

    disconnectPawmodoro: async () => {
      const pawmodoroConfig = await window.api.pawmodoro.disconnect()
      set({ pawmodoroConfig })
    },

    loadPairingsConfig: async () => {
      set({ pairingsConfig: await window.api.pairings.getConfig() })
    },

    connectPairings: async (email, password) => {
      const pairingsConfig = await window.api.pairings.connect(email, password)
      set({ pairingsConfig, pairingsRecords: null, pairingsLinks: null, pairingsError: null })
      await get().loadPairingsRecords()
    },

    disconnectPairings: async () => {
      const pairingsConfig = await window.api.pairings.disconnect()
      set({ pairingsConfig, pairingsRecords: null, pairingsLinks: null, pairingsError: null })
    },

    loadPairingsRecords: async (options) => {
      if (!get().pairingsConfig.connected || get().pairingsLoading) return
      if (options?.ifOlderThanMs != null && Date.now() - pairingsFetchedAt < options.ifOlderThanMs) return
      set({ pairingsLoading: true, pairingsError: null })
      pairingsFetchedAt = Date.now()
      try {
        const records = await window.api.pairings.deckRecords()
        const byDeck: Record<string, PairingsResult[]> = {}
        const links: Record<string, PairingsLink> = {}
        for (const r of records) {
          if (r.results.length) byDeck[r.brewhouseDeckId] = [...(byDeck[r.brewhouseDeckId] ?? []), ...r.results]
          links[r.brewhouseDeckId] = { syncedHash: r.syncedHash, version: r.version, versions: r.versions }
        }
        set({ pairingsRecords: byDeck, pairingsLinks: links })
      } catch (err) {
        set({ pairingsError: errorMessage(err) })
      } finally {
        set({ pairingsLoading: false })
      }
    },

    pushWishlistToPawmodoro: async (items) => {
      set({ pushingWishlist: true })
      try {
        const { pushed, failed } = await window.api.pawmodoro.pushWishlist(items)
        if (pushed.length > 0) {
          const wishlist = await window.api.wishlist.markPushed(pushed)
          set({ wishlist })
        }
        return { pushedCount: pushed.length, failedCount: failed.length }
      } finally {
        set({ pushingWishlist: false })
      }
    },

    loadForTrade: async () => {
      const ids = await window.api.collection.getForTrade()
      set({ forTrade: new Set(ids) })
    },

    toggleForTrade: async (cardId) => {
      const isOn = get().forTrade.has(cardId)
      const ids = await window.api.collection.setForTrade(cardId, !isOn)
      set({ forTrade: new Set(ids) })
    },

    setTradeVisibility: async (isPublic, displayName) => {
      if (isPublic) askToNotify() // before any await, while it's still the click: new matches are announced
      await window.api.pawmodoro.setTradeProfile(isPublic, displayName)
      const tradeProfile = { public: isPublic, displayName }
      set((s) => ({ settings: { ...s.settings, tradeProfile } }))
      persistSettings({ tradeProfile })
      if (isPublic) await get().syncTradeData()
    },

    syncTradeData: async () => {
      set({ tradeSyncing: true })
      try {
        const { catalogs, collection, forTrade, wishlist } = get()
        const cardsById = (gameId: GameId) => catalogs[gameId]?.byId
        const ownedResult = buildTradeCollection(collection, forTrade, cardsById)
        const wantsResult = buildTradeWants(wishlist, cardsById)
        await Promise.all([
          window.api.pawmodoro.syncTradeCollection(ownedResult.entries),
          window.api.pawmodoro.syncTradeWants(wantsResult.entries),
        ])
        return { skipped: ownedResult.skipped + wantsResult.skipped }
      } finally {
        set({ tradeSyncing: false })
      }
    },

    loadBrowseTraders: async () => {
      const browseTraders = await window.api.pawmodoro.browseTraders()
      set({ browseTraders })
    },

    loadTradeMatches: async () => {
      const tradeMatches = await window.api.pawmodoro.tradeMatches()
      set({ tradeMatches })
      noteTradeMatches(tradeMatches, true) // you're looking at them: nothing to announce later
    },

    exportBackup: () => window.api.backup.export(),

    importBackup: async () => {
      const result = await window.api.backup.import()
      if (result.imported) {
        await Promise.all([get().loadDecks(), get().loadWishlist(), get().loadCollection()])
        // Undo entries describe the decks as they were before the restore; they no longer apply.
        set((s) => ({ undoStack: [], currentDeckId: s.decks.some((d) => d.id === s.currentDeckId) ? s.currentDeckId : null }))
      }
      return result
    },
  }
})

export function useCardsById(gameId: GameId): Map<string, Card> {
  const catalog = useAppStore((s) => s.catalogs[gameId])
  return catalog?.byId ?? EMPTY_MAP
}

/** Copies owned per card pool, recomputed only when the collection or a catalog changes. */
export function useOwnedIndex(): Map<string, number> {
  const collection = useAppStore((s) => s.collection)
  const catalogs = useAppStore((s) => s.catalogs)
  return useMemo(() => ownedIndexOf(collection, catalogs), [collection, catalogs])
}

const EMPTY_MAP = new Map<string, Card>()

export { GAME_LIST }

/** The game tabs in the order you arranged them (the default order until you do). */
export function useOrderedGames() {
  const order = useAppStore((s) => s.settings.gameOrder)
  return useMemo(() => orderGames(GAME_LIST, order), [order])
}

/** Same as useOrderedGames, minus any games hidden via setGameHidden. */
export function useVisibleGames() {
  const ordered = useOrderedGames()
  const hidden = useAppStore((s) => s.settings.hiddenGames)
  return useMemo(() => (hidden?.length ? ordered.filter((g) => !hidden.includes(g.id)) : ordered), [ordered, hidden])
}
