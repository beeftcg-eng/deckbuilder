import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  AppSettings,
  Card,
  CardCacheMeta,
  Collection,
  Deck,
  DeckCardEntry,
  DeckFreeTextEntry,
  DeckViewMode,
  Format,
  GameId,
  PawmodoroConfig,
  SyncProgress,
  WishlistEntry,
} from '../shared/types'
import { GAME_LIST, getAdapter } from '../shared/games/registry'
import { buildPoolIndex, gameIdOfCardId, missingForDeck } from '../shared/collection'
import type { ParsedDeck } from '../shared/importDeck'
import { moveOneCopy, withQuantity } from '../shared/deckEdits'
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
  settings: AppSettings
  undoStack: UndoEntry[]
  /** Last failure worth telling the user about (e.g. a save that didn't go through). */
  error: string | null

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
  undo: () => Promise<void>
  setDeckSort: (sort: 'recent' | 'name') => void
  setDeckViewMode: (mode: DeckViewMode) => void
  applySyncProgress: (progress: SyncProgress) => void

  setShowWishlist: (show: boolean) => void
  loadWishlist: () => Promise<void>
  addToWishlist: (card: Card, quantity?: number) => Promise<void>
  addDeckToWishlist: (deck: Deck) => Promise<number>
  wishlistMissing: (deck: Deck) => Promise<number>
  setWishlistQuantity: (entryId: string, quantity: number) => Promise<void>
  removeFromWishlist: (entryId: string) => Promise<void>

  loadCollection: () => Promise<void>
  /** Adds (or, if negative, removes) copies of one printing. Relative, so quick repeat clicks can't overwrite each other. */
  changeOwned: (cardId: string, delta: number) => Promise<void>
  markDeckOwned: (deck: Deck) => Promise<number>
  markGotIt: (entryId: string) => Promise<void>

  loadPawmodoroConfig: () => Promise<void>
  connectPawmodoro: (url: string, anonKey: string, email: string, password: string, signUp?: boolean) => Promise<void>
  disconnectPawmodoro: () => Promise<void>
  pushWishlistToPawmodoro: (items: { entryId: string; text: string }[]) => Promise<{ pushedCount: number; failedCount: number }>

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
  async function persistDeck(deck: Deck): Promise<void> {
    try {
      const saved = await window.api.decks.save(deck)
      set((s) => ({
        decks: s.decks.map((d) => (d.id === saved.id ? { ...d, createdAt: saved.createdAt, updatedAt: saved.updatedAt } : d)),
      }))
    } catch (err) {
      set({ error: `Couldn't save "${deck.name}": ${errorMessage(err)}` })
    }
  }

  function currentCatalogById(gameId: GameId): Map<string, Card> {
    return get().catalogs[gameId]?.byId ?? new Map()
  }

  async function addAndSelectDeck(deck: Deck, undoLabel: string): Promise<void> {
    const saved = await window.api.decks.save(deck)
    set((s) => ({ decks: [...s.decks, saved], currentDeckId: saved.id, currentGameId: saved.gameId, showWishlist: false }))
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
    showWishlist: false,
    settings: {},
    undoStack: [],
    error: null,

    wishlist: [],
    collection: {},
    pawmodoroConfig: { url: DEFAULT_PAWMODORO_URL, anonKey: DEFAULT_PAWMODORO_ANON_KEY, email: '', connected: false },
    pushingWishlist: false,

    initialize: async () => {
      try {
        const [decks, settings] = await Promise.all([window.api.decks.list(), window.api.settings.get()])
        set({ decks, settings })

        // Reopen where you left off: the last deck (which also implies its game), else the last game.
        const lastDeck = decks.find((d) => d.id === settings.lastDeckId)
        if (lastDeck) set({ currentDeckId: lastDeck.id, currentGameId: lastDeck.gameId })
        else if (settings.lastGameId) set({ currentGameId: settings.lastGameId })

        await Promise.all([
          get().loadWishlist(),
          get().loadCollection(),
          ...GAME_LIST.map((adapter) => get().loadMeta(adapter.id)),
          ...GAME_LIST.map((adapter) => get().loadFormats(adapter.id)),
        ])
      } catch (err) {
        set({ error: `Couldn't load your data: ${errorMessage(err)}` })
      }
    },

    setError: (message) => set({ error: message }),

    setGame: (gameId) => {
      set({ currentGameId: gameId })
      persistSettings({ lastGameId: gameId })
    },

    loadMeta: async (gameId) => {
      const meta = await window.api.cards.meta(gameId)
      set((s) => ({ syncMeta: { ...s.syncMeta, [gameId]: meta } }))
    },

    loadCatalog: async (gameId) => {
      const cards = await window.api.cards.load(gameId)
      const byId = new Map(cards.map((c) => [c.id, c]))
      set((s) => ({ catalogs: { ...s.catalogs, [gameId]: { cards, byId } } }))
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
      const copy: Deck = { ...structuredClone(source), id: crypto.randomUUID(), name: `${source.name} (copy)`, createdAt: now, updatedAt: now }
      await addAndSelectDeck(copy, `Duplicate "${source.name}"`)
    },

    importDeck: async (gameId, parsed, name, formatId) => {
      const deck: Deck = { ...emptyDeck(gameId, formatId), name, zones: parsed.zones, freeTextZones: parsed.freeTextZones }
      await addAndSelectDeck(deck, `Import "${name}"`)
    },

    selectDeck: (deckId) => {
      set({ currentDeckId: deckId })
      persistSettings({ lastDeckId: deckId })
    },

    deleteDeck: async (deckId) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
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

    updateDeck: async (updater, undoLabel = 'Edit deck') => {
      const { currentDeckId, decks } = get()
      const current = decks.find((d) => d.id === currentDeckId)
      if (!current) return
      const next = updater(current)
      if (next === current) return
      // Applied to the store immediately, so a second click a few ms later builds on
      // this edit instead of on the stale deck that was there before the save returned.
      set((s) => ({ decks: s.decks.map((d) => (d.id === next.id ? next : d)) }))
      pushUndo({ kind: 'edit', label: undoLabel, before: current })
      await persistDeck(next)
    },

    setCardQuantity: async (zoneId, card, quantity) => {
      const deck = get().decks.find((d) => d.id === get().currentDeckId)
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
      set((s) => ({ undoStack: s.undoStack.slice(0, -1) }))

      if (entry.kind === 'edit') {
        set((s) => ({ decks: s.decks.map((d) => (d.id === entry.before.id ? entry.before : d)) }))
        await persistDeck(entry.before)
      } else if (entry.kind === 'delete') {
        set((s) => ({ decks: [...s.decks, entry.deck], currentDeckId: entry.deck.id, currentGameId: entry.deck.gameId, showWishlist: false }))
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
    setDeckViewMode: (mode) => persistSettings({ deckViewMode: mode }),

    applySyncProgress: (progress) => set((s) => ({ syncProgress: { ...s.syncProgress, [progress.gameId]: progress } })),

    setShowWishlist: (show) => set({ showWishlist: show }),

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
