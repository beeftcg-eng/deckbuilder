import { staleIdRepairs, storedCardIds } from '../../shared/cardIdRepair'
import { applyArtChoices, printingKey, withArtwork } from '../../shared/artChoice'
import { t } from '../../shared/i18n'
import { errorMessage, type AppState } from '../storeUtils'
import type { StoreContext } from '../storeContext'

/** Each game's card data: loading, syncing, formats, and Yu-Gi-Oh! artwork choices. */
export function createCatalogSlice(ctx: StoreContext) {
  const { set, get, persistSettings, summarized, recordValueOf, checkAlerts, persistDeck } = ctx
  return {
    catalogs: {},
    syncMeta: {},
    syncProgress: {},
    formats: {},

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

    applySyncProgress: (progress) => set((s) => ({ syncProgress: { ...s.syncProgress, [progress.gameId]: progress } })),
  } satisfies Partial<AppState>
}
