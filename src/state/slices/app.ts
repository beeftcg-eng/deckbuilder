import type { GameId } from '../../shared/types'
import { GAME_LIST } from '../../shared/games/registry'
import { parseShareToken } from '../../shared/deckShare'
import { loadAnnouncement } from '../../shared/announcement'
import { displayCurrency, setDisplayCurrency } from '../../shared/currency'
import { applyTheme } from '../../lib/theme'
import { getLanguage, isLanguage, t } from '../../shared/i18n'
import { applyLanguage } from '../../lib/language'
import { errorMessage, loadExchangeRates, type AppState } from '../storeUtils'
import type { StoreContext } from '../storeContext'

/** Startup, what is on screen, and the preferences (theme, language, currency, game order). */
export function createAppSlice(ctx: StoreContext) {
  const { set, get, flags, persistSettings, recordValueOf, checkAlerts, checkTradeMatches, refreshAllPrices } = ctx
  return {
    currentGameId: 'riftbound',
    showBinders: false,
    showWishlist: false,
    showCollection: false,
    showMyDecks: false,
    showTrade: false,
    settings: {},
    error: null,
    notice: null,
    updateStatus: null,
    language: getLanguage(),
    showTour: false,
    announcement: null,
    showScanner: false,
    currencyKey: 'USD',
    showShortcuts: false,

    dismissAnnouncement: () => {
      const id = get().announcement?.id
      set({ announcement: null })
      if (!id) return
      set((s) => ({ settings: { ...s.settings, announcementSeen: id } }))
      persistSettings({ announcementSeen: id })
    },

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
        // A message to everyone (shared/announcement.ts), once. Not over the tour or a share link, so it waits for the next launch.
        void loadAnnouncement().then((announcement) => {
          if (!announcement || announcement.id === get().settings.announcementSeen) return
          if (get().showTour || get().sharedDeckState) return
          set({ announcement })
        })
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
        flags.startupLoaded = true
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

    setGame: (gameId) => {
      set({ currentGameId: gameId })
      persistSettings({ lastGameId: gameId })
    },

    setShowBinders: (show) => set(show ? { showBinders: true, showWishlist: false, showCollection: false, showMyDecks: false, showTrade: false } : { showBinders: false }),
    setShowScanner: (show) => set({ showScanner: show }),
    setShowShortcuts: (show) => set({ showShortcuts: show }),
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
    setUpdateStatus: (status) => set({ updateStatus: status }),

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

    setShowWishlist: (show) =>
      set(show ? { showWishlist: true, showCollection: false, showMyDecks: false, showTrade: false, showBinders: false } : { showWishlist: false }),
    setShowCollection: (show) =>
      set(show ? { showCollection: true, showWishlist: false, showMyDecks: false, showTrade: false, showBinders: false } : { showCollection: false }),
    setShowTrade: (show) =>
      set(show ? { showTrade: true, showWishlist: false, showCollection: false, showMyDecks: false, showBinders: false } : { showTrade: false }),

    exportBackup: () => window.api.backup.export(),

    importBackup: async () => {
      const result = await window.api.backup.import()
      if (result.imported) {
        const [settings] = await Promise.all([window.api.settings.get(), get().loadDecks(), get().loadWishlist(), get().loadCollection(), get().loadBinders()])
        set({ settings })
        // Undo entries describe the decks as they were before the restore; they no longer apply.
        set((s) => ({ undoStack: [], currentDeckId: s.decks.some((d) => d.id === s.currentDeckId) ? s.currentDeckId : null }))
      }
      return result
    },
  } satisfies Partial<AppState>
}
