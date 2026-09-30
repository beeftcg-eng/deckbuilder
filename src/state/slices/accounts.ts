import type { GameId, PairingsLink, PairingsResult } from '../../shared/types'
import { askToNotify } from '../../lib/notify'
import { buildTradeCollection, buildTradeWants } from '../../shared/trade'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../../shared/pawmodoroDefaults'
import { errorMessage, type AppState } from '../storeUtils'
import type { StoreContext } from '../storeContext'

/** The Pawmodoro and Pairings accounts, and trading. */
export function createAccountsSlice(ctx: StoreContext) {
  const { set, get, persistSettings, noteTradeMatches } = ctx
  /** When Pairings results were last fetched (ms), so coming back to the window doesn't refetch every time. */
  let pairingsFetchedAt = 0
  return {
    pawmodoroConfig: { url: DEFAULT_PAWMODORO_URL, anonKey: DEFAULT_PAWMODORO_ANON_KEY, email: '', connected: false },
    pushingWishlist: false,
    pairingsConfig: { email: '', connected: false },
    pairingsRecords: null,
    pairingsLinks: null,
    pairingsLoading: false,
    pairingsError: null,
    tradeSyncing: false,
    browseTraders: [],
    tradeMatches: [],

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
  } satisfies Partial<AppState>
}
