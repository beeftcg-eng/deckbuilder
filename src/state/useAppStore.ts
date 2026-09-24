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
  PairingsResult,
  PawmodoroConfig,
  SyncProgress,
  TradeMatch,
  TraderProfile,
  WishlistEntry,
} from '../shared/types'
import { GAME_LIST, getAdapter } from '../shared/games/registry'
import { buildPoolIndex, gameIdOfCardId, missingForDeck } from '../shared/collection'
import { buildTradeCollection, buildTradeWants } from '../shared/trade'
import type { ParsedDeck } from '../shared/importDeck'
import { moveOneCopy, withQuantity } from '../shared/deckEdits'
import type { UpdateStatus } from '../shared/updateStatus'
import { currentDeckFor } from '../shared/decks'
import { applyVisibleOrder, reorderByDrop, type DeckSortMode } from '../shared/deckOrder'
import { orderGames } from '../shared/gameOrder'
import { applyTheme } from '../lib/theme'
import { withSummary } from '../shared/deckSummary'
import { staleIdRepairs, storedCardIds } from '../shared/cardIdRepair'
import { applyArtChoices, printingKey, withArtwork } from '../shared/artChoice'
import { addToBinder, addToDeck, deckMoveProblem, takeFromBinder, zoneForCard } from '../shared/cardMoves'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../shared/pawmodoroDefaults'

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
    name: 'New Deck',
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
  /** Moves copies of a card from one binder to another. */
  moveBinderCards: (fromBinderId: string, toBinderId: string, cardId: string, quantity: number) => Promise<void>
  /** Moves copies of a card out of a binder into a deck (the zone the card browser would pick). Returns whether it moved. */
  moveBinderCardsToDeck: (binderId: string, deckId: string, card: Card, quantity: number) => Promise<boolean>
  /** Whether the open deck is shown as the read-only full view (the default when a deck is selected) rather than in the editor. */
  deckViewing: boolean
  setDeckViewing: (viewing: boolean) => void
  /** Locks a deck so it can't be changed or deleted, or unlocks it. Not an edit itself, so it isn't undoable. */
  setDeckLocked: (deckId: string, locked: boolean) => Promise<void>
  /** Saves the order of the game tabs in the sidebar. */
  setGameOrder: (order: GameId[]) => void
  /** Shows or hides a game's tab in the sidebar. Never lets the last visible game be hidden, and switches off a game you're hiding. */
  setGameHidden: (gameId: GameId, hidden: boolean) => void
  /** Opens a deck from anywhere (the My Decks page): switches to its game, selects it, and shows the deck panel. */
  openDeck: (deckId: string) => void
  setDeckViewMode: (mode: DeckViewMode) => void
  setUpdateStatus: (status: UpdateStatus) => void
  setTheme: (id: string) => void
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
    if (!catalog) return deck
    const formats = get().formats[deck.gameId] ?? getAdapter(deck.gameId).defaultFormats
    return withSummary(deck, catalog.byId, formats.find((f) => f.id === deck.formatId)?.label ?? null)
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
      set({ error: `Couldn't save "${deck.name}": ${errorMessage(err)}` })
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
    pairingsLoading: false,
    pairingsError: null,
    forTrade: new Set(),
    tradeSyncing: false,
    browseTraders: [],
    tradeMatches: [],

    initialize: async () => {
      try {
        const [decks, settings] = await Promise.all([window.api.decks.list(), window.api.settings.get()])
        set({ decks, settings })
        applyTheme(settings.theme)

        // Open the deck a link names (Pairings' "Open in Brewhouse" goes to the phone app with ?deck=<id>),
        // else reopen where you left off: the last deck (which also implies its game), else the last game.
        const linkedDeckId = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('deck')
        if (linkedDeckId) history.replaceState(null, '', location.pathname + location.hash)
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
        set({ error: `Couldn't load your data: ${errorMessage(err)}` })
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
        const { decks, binders, collection, wishlist } = get()
        const repairs = staleIdRepairs(storedCardIds({ decks, binders, collection, wishlist }), cards)
        if (repairs.size > 0) {
          try {
            const fixed = await window.api.repairCardIds([...repairs])
            if (fixed.repaired > 0) {
              set({
                decks: fixed.decks,
                binders: fixed.binders,
                collection: fixed.collection,
                forTrade: new Set(fixed.forTrade),
                wishlist: fixed.wishlist,
                notice: `Restored ${fixed.repaired} Yu-Gi-Oh! card${fixed.repaired === 1 ? '' : 's'} in your decks, binders, collection and wishlist that the updated card data had renamed.`,
              })
            }
          } catch (err) {
            set({ error: `Couldn't restore Yu-Gi-Oh! cards after the card-data update: ${errorMessage(err)}` })
          }
        }
      }
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
      await addAndSelectDeck(emptyDeck(gameId, formatId), 'Create deck')
    },

    duplicateDeck: async (deckId) => {
      const source = get().decks.find((d) => d.id === deckId)
      if (!source) return
      const now = new Date().toISOString()
      const { locked: _wasLocked, ...unlocked } = structuredClone(source) // a copy is for editing, so it starts unlocked
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
        set({ error: `"${deck.name}" is locked. Unlock it to delete it.` })
        return
      }
      set((s) => ({
        decks: s.decks.filter((d) => d.id !== deckId),
        currentDeckId: s.currentDeckId === deckId ? null : s.currentDeckId,
      }))
      pushUndo({ kind: 'delete', label: `Delete "${deck.name}"`, deck })
      try {
        await window.api.decks.delete(deckId)
      } catch (err) {
        set((s) => ({ decks: [...s.decks, deck], error: `Couldn't delete "${deck.name}": ${errorMessage(err)}` }))
      }
    },

    setShowBinders: (show) => set(show ? { showBinders: true, showWishlist: false, showCollection: false, showMyDecks: false, showTrade: false } : { showBinders: false }),

    loadBinders: async () => {
      const binders = await window.api.binders.list()
      set({ binders })
    },

    createBinder: async (name) => {
      const now = new Date().toISOString()
      const binder: Binder = { id: crypto.randomUUID(), name: name?.trim() || 'New binder', cards: {}, createdAt: now, updatedAt: now }
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
        set((s) => ({ binders: [...s.binders, binder], error: `Couldn't delete "${binder.name}": ${errorMessage(err)}` }))
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

    moveBinderCards: async (fromBinderId, toBinderId, cardId, quantity) => {
      const from = get().binders.find((b) => b.id === fromBinderId)
      const to = get().binders.find((b) => b.id === toBinderId)
      if (!from || !to || from.id === to.id || quantity <= 0) return
      const n = Math.min(quantity, from.cards[cardId] ?? 0)
      if (n <= 0) return
      const nextFrom = takeFromBinder(from, cardId, n)
      const nextTo = addToBinder(to, cardId, n)
      set((s) => ({ binders: s.binders.map((b) => (b.id === from.id ? nextFrom : b.id === to.id ? nextTo : b)) }))
      try {
        const [savedFrom, savedTo] = await Promise.all([window.api.binders.save(nextFrom), window.api.binders.save(nextTo)])
        set((s) => ({ binders: s.binders.map((b) => (b.id === savedFrom.id ? savedFrom : b.id === savedTo.id ? savedTo : b)) }))
      } catch (err) {
        set((s) => ({ binders: s.binders.map((b) => (b.id === from.id ? from : b.id === to.id ? to : b)), error: `Couldn't move the cards: ${errorMessage(err)}` }))
      }
    },

    moveBinderCardsToDeck: async (binderId, deckId, card, quantity) => {
      const binder = get().binders.find((b) => b.id === binderId)
      const deck = get().decks.find((d) => d.id === deckId)
      if (!binder || !deck || quantity <= 0) return false
      const problem = deckMoveProblem(deck, card)
      if (problem) {
        set({ error: problem })
        return false
      }
      const n = Math.min(quantity, binder.cards[card.id] ?? 0)
      if (n <= 0) return false
      const nextDeck = addToDeck(deck, zoneForCard(deck, card)!.id, card.id, n)
      const nextBinder = takeFromBinder(binder, card.id, n)
      set((s) => ({
        decks: s.decks.map((d) => (d.id === deck.id ? nextDeck : d)),
        binders: s.binders.map((b) => (b.id === binder.id ? nextBinder : b)),
      }))
      // Not on the undo stack: undo only restores decks, so it would drop these copies from the binder
      // and the deck both. Moving them back is removing them from the deck and adding to the binder.
      await persistDeck(nextDeck)
      try {
        const saved = await window.api.binders.save(nextBinder)
        set((s) => ({ binders: s.binders.map((b) => (b.id === saved.id ? saved : b)) }))
      } catch (err) {
        set({ error: `Added to "${deck.name}", but couldn't update the binder: ${errorMessage(err)}` })
      }
      return true
    },

    updateDeck: async (updater, undoLabel = 'Edit deck') => {
      const { currentDeckId, currentGameId, decks } = get()
      const current = currentDeckFor(decks, currentDeckId, currentGameId)
      if (!current) return
      if (current.locked) {
        set({ error: `"${current.name}" is locked. Unlock it to make changes.` })
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
        `${quantity > previous ? 'Add' : 'Remove'} ${card.name}`,
      )
    },

    moveCard: async (fromZoneId, toZone, card) => {
      await get().updateDeck((d) => moveOneCopy(d, fromZoneId, toZone.id, card.id), `Move ${card.name} to ${toZone.label}`)
    },

    reorderDeckEntries: async (zoneId, dragCardId, targetCardId, position) => {
      await get().updateDeck((d) => {
        const entries = d.zones[zoneId] ?? []
        const ids = entries.map((e) => e.cardId)
        const nextIds = reorderByDrop(ids, dragCardId, targetCardId, position)
        if (nextIds.join('|') === ids.join('|')) return d
        const byId = new Map(entries.map((e) => [e.cardId, e]))
        return { ...d, zones: { ...d.zones, [zoneId]: nextIds.map((id) => byId.get(id)!) } }
      }, 'Reorder cards')
    },

    setFreeTextQuantity: async (zoneId, label, quantity) => {
      await get().updateDeck(
        (d) => {
          const nextEntries = withQuantity<DeckFreeTextEntry>(d.freeTextZones[zoneId] ?? [], (e) => e.label === label, () => ({ label, quantity }), quantity)
          return { ...d, freeTextZones: { ...d.freeTextZones, [zoneId]: nextEntries } }
        },
        `Change ${label}`,
      )
    },

    undo: async () => {
      const entry = get().undoStack.at(-1)
      if (!entry) return
      const lockedNow = entry.kind === 'edit' ? get().decks.find((d) => d.id === entry.before.id)?.locked : entry.kind === 'create' ? get().decks.find((d) => d.id === entry.deckId)?.locked : false
      if (lockedNow) {
        // Leave the entry on the stack: unlocking the deck makes it undoable again.
        set({ error: 'That deck is locked, so the change was left alone. Unlock it first.' })
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
          set({ error: `Couldn't undo: ${errorMessage(err)}` })
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
      }, cardId ? 'Set deck icon' : 'Clear deck icon')
    },

    setTheme: (id) => {
      applyTheme(id) // instant; the saved copy follows
      persistSettings({ theme: id })
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
      set({ pairingsConfig, pairingsRecords: null, pairingsError: null })
      await get().loadPairingsRecords()
    },

    disconnectPairings: async () => {
      const pairingsConfig = await window.api.pairings.disconnect()
      set({ pairingsConfig, pairingsRecords: null, pairingsError: null })
    },

    loadPairingsRecords: async (options) => {
      if (!get().pairingsConfig.connected || get().pairingsLoading) return
      if (options?.ifOlderThanMs != null && Date.now() - pairingsFetchedAt < options.ifOlderThanMs) return
      set({ pairingsLoading: true, pairingsError: null })
      pairingsFetchedAt = Date.now()
      try {
        const records = await window.api.pairings.deckRecords()
        const byDeck: Record<string, PairingsResult[]> = {}
        for (const r of records) byDeck[r.brewhouseDeckId] = [...(byDeck[r.brewhouseDeckId] ?? []), ...r.results]
        set({ pairingsRecords: byDeck })
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
