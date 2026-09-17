import { create } from 'zustand'
import type {
  Card,
  CardCacheMeta,
  Deck,
  DeckCardEntry,
  DeckFreeTextEntry,
  Format,
  GameId,
  PawmodoroConfig,
  SyncProgress,
  WishlistEntry,
} from '../shared/types'
import { GAME_LIST, getAdapter } from '../shared/games/registry'

interface Catalog {
  cards: Card[]
  byId: Map<string, Card>
}

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

interface AppState {
  currentGameId: GameId
  catalogs: Partial<Record<GameId, Catalog>>
  syncMeta: Partial<Record<GameId, CardCacheMeta>>
  syncProgress: Partial<Record<GameId, SyncProgress>>
  formats: Partial<Record<GameId, Format[]>>
  decks: Deck[]
  currentDeckId: string | null
  showWishlist: boolean

  wishlist: WishlistEntry[]
  pawmodoroConfig: PawmodoroConfig
  pushingWishlist: boolean

  setGame: (gameId: GameId) => void
  loadMeta: (gameId: GameId) => Promise<void>
  loadCatalog: (gameId: GameId) => Promise<void>
  syncCatalog: (gameId: GameId) => Promise<void>
  loadFormats: (gameId: GameId) => Promise<void>
  loadDecks: () => Promise<void>
  createDeck: (gameId: GameId) => Promise<void>
  selectDeck: (deckId: string | null) => void
  deleteDeck: (deckId: string) => Promise<void>
  updateDeck: (updater: (deck: Deck) => Deck) => Promise<void>
  setCardQuantity: (zoneId: string, card: Card, quantity: number) => Promise<void>
  setFreeTextQuantity: (zoneId: string, label: string, quantity: number) => Promise<void>
  applySyncProgress: (progress: SyncProgress) => void

  setShowWishlist: (show: boolean) => void
  loadWishlist: () => Promise<void>
  addToWishlist: (card: Card, quantity?: number) => Promise<void>
  addDeckToWishlist: (deck: Deck) => Promise<number>
  setWishlistQuantity: (entryId: string, quantity: number) => Promise<void>
  removeFromWishlist: (entryId: string) => Promise<void>
  loadPawmodoroConfig: () => Promise<void>
  connectPawmodoro: (url: string, anonKey: string, email: string, password: string) => Promise<void>
  disconnectPawmodoro: () => Promise<void>
  pushWishlistToPawmodoro: (items: { entryId: string; text: string }[]) => Promise<{ pushedCount: number; failedCount: number }>

  exportBackup: () => Promise<boolean>
  importBackup: () => Promise<{ imported: boolean; deckCount: number; wishlistCount: number }>
}

export const useAppStore = create<AppState>((set, get) => ({
  currentGameId: 'riftbound',
  catalogs: {},
  syncMeta: {},
  syncProgress: {},
  formats: {},
  decks: [],
  currentDeckId: null,
  showWishlist: false,

  wishlist: [],
  pawmodoroConfig: { url: '', anonKey: '', email: '', connected: false },
  pushingWishlist: false,

  setGame: (gameId) => set({ currentGameId: gameId }),

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
    const deck = emptyDeck(gameId, formatId)
    const saved = await window.api.decks.save(deck)
    set((s) => ({ decks: [...s.decks, saved], currentDeckId: saved.id, currentGameId: gameId }))
  },

  selectDeck: (deckId) => set({ currentDeckId: deckId }),

  deleteDeck: async (deckId) => {
    await window.api.decks.delete(deckId)
    set((s) => ({
      decks: s.decks.filter((d) => d.id !== deckId),
      currentDeckId: s.currentDeckId === deckId ? null : s.currentDeckId,
    }))
  },

  updateDeck: async (updater) => {
    const { currentDeckId, decks } = get()
    const current = decks.find((d) => d.id === currentDeckId)
    if (!current) return
    const next = updater(current)
    const saved = await window.api.decks.save(next)
    set((s) => ({ decks: s.decks.map((d) => (d.id === saved.id ? saved : d)) }))
  },

  setCardQuantity: async (zoneId, card, quantity) => {
    await get().updateDeck((deck) => {
      const existing = deck.zones[zoneId] ?? []
      const withoutCard = existing.filter((e) => e.cardId !== card.id)
      const nextEntries: DeckCardEntry[] = quantity > 0 ? [...withoutCard, { cardId: card.id, quantity }] : withoutCard
      return { ...deck, zones: { ...deck.zones, [zoneId]: nextEntries } }
    })
  },

  setFreeTextQuantity: async (zoneId, label, quantity) => {
    await get().updateDeck((deck) => {
      const existing = deck.freeTextZones[zoneId] ?? []
      const withoutLabel = existing.filter((e) => e.label !== label)
      const nextEntries: DeckFreeTextEntry[] = quantity > 0 ? [...withoutLabel, { label, quantity }] : withoutLabel
      return { ...deck, freeTextZones: { ...deck.freeTextZones, [zoneId]: nextEntries } }
    })
  },
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
    return items.length
  },

  setWishlistQuantity: async (entryId, quantity) => {
    const wishlist = await window.api.wishlist.setQuantity(entryId, quantity)
    set({ wishlist })
  },

  removeFromWishlist: async (entryId) => {
    const wishlist = await window.api.wishlist.remove(entryId)
    set({ wishlist })
  },

  loadPawmodoroConfig: async () => {
    const pawmodoroConfig = await window.api.pawmodoro.getConfig()
    set({ pawmodoroConfig })
  },

  connectPawmodoro: async (url, anonKey, email, password) => {
    const pawmodoroConfig = await window.api.pawmodoro.connect(url, anonKey, email, password)
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
      await get().loadDecks()
      await get().loadWishlist()
    }
    return result
  },
}))

export function useCardsById(gameId: GameId): Map<string, Card> {
  const catalog = useAppStore((s) => s.catalogs[gameId])
  return catalog?.byId ?? EMPTY_MAP
}

const EMPTY_MAP = new Map<string, Card>()

export { GAME_LIST }
