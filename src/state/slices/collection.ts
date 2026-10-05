import { missingForDeck } from '../../shared/collection'
import { changePull } from '../../shared/packOpenings'
import { cardIdsOfGame, newBatch, removalItems, undoItems, withBatch } from '../../shared/collectionBatches'
import { fitDetails, normalizeDetails, withDetail, type CollectionDetails } from '../../shared/copyDetails'
import { ownedIndexOf, wishlistIndexOf, type AppState } from '../storeUtils'
import type { StoreContext } from '../storeContext'

/** The collection, wishlist and trade marks, with batches, copy details, pack openings, price alerts and the value graph. */
export function createCollectionSlice(ctx: StoreContext) {
  const { set, get, persistSettings, recordValueOf, saveDetails, checkAlerts, currentCatalogById } = ctx
  return {

    wishlist: [],
    collection: {},
    forTrade: new Set(),
    activeOpeningId: null,
    setActiveOpening: (id) => set({ activeOpeningId: id }),
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

    setCopyDetail: (cardId, kind, quantity) => {
      get().setCopyDetails(cardId, withDetail(get().settings.collectionDetails?.[cardId], kind, quantity))
    },

    setCopyDetails: (cardId, details) => {
      const fitted = fitDetails(get().collection[cardId] ?? 0, details)
      const current = get().settings.collectionDetails ?? {}
      if (JSON.stringify(current[cardId] ?? []) === JSON.stringify(fitted)) return
      const next: CollectionDetails = { ...current }
      if (fitted.length) next[cardId] = fitted
      else delete next[cardId]
      saveDetails(next)
    },

    addCopyDetails: (items) => {
      const current = get().settings.collectionDetails ?? {}
      const next: CollectionDetails = { ...current }
      let changed = false
      for (const { cardId, details } of items) {
        if (!details.length) continue
        const merged = fitDetails(get().collection[cardId] ?? 0, normalizeDetails([...(next[cardId] ?? []), ...details]))
        if (merged.length) next[cardId] = merged
        changed = true
      }
      if (changed) saveDetails(next)
    },

    recordCollectionBatch: (gameId, source, items) => {
      const batch = newBatch(gameId, source, items)
      if (!batch) return
      const collectionBatches = withBatch(get().settings.collectionBatches ?? [], batch)
      set((s) => ({ settings: { ...s.settings, collectionBatches } }))
      persistSettings({ collectionBatches })
    },

    undoCollectionBatch: async (batchId) => {
      const batch = (get().settings.collectionBatches ?? []).find((b) => b.id === batchId)
      if (!batch) return 0
      const items = undoItems(batch, get().collection)
      if (items.length > 0) set({ collection: await window.api.collection.add(items) })
      const collectionBatches = (get().settings.collectionBatches ?? []).filter((b) => b.id !== batchId)
      set((s) => ({ settings: { ...s.settings, collectionBatches } }))
      persistSettings({ collectionBatches })
      return items.reduce((sum, i) => sum + Math.abs(i.quantity), 0)
    },

    removeFromCollection: async (gameId, cardIds) => {
      const items = removalItems(get().collection, cardIds)
      if (items.length === 0) return 0
      set({ collection: await window.api.collection.add(items) })
      get().recordCollectionBatch(gameId, 'delete', items)
      return -items.reduce((sum, i) => sum + i.quantity, 0)
    },

    clearCollection: async (gameId) => {
      const items = removalItems(get().collection, cardIdsOfGame(get().collection, gameId))
      if (items.length === 0) return 0
      set({ collection: await window.api.collection.add(items) })
      get().recordCollectionBatch(gameId, 'clear', items)
      return -items.reduce((sum, i) => sum + i.quantity, 0)
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

    loadForTrade: async () => {
      const ids = await window.api.collection.getForTrade()
      set({ forTrade: new Set(ids) })
    },

    toggleForTrade: async (cardId) => {
      const isOn = get().forTrade.has(cardId)
      const ids = await window.api.collection.setForTrade(cardId, !isOn)
      set({ forTrade: new Set(ids) })
    },

    markForTrade: async (cardIds) => {
      for (const cardId of cardIds) {
        if (get().forTrade.has(cardId)) continue
        const ids = await window.api.collection.setForTrade(cardId, true)
        set({ forTrade: new Set(ids) })
      }
    },
  } satisfies Partial<AppState>
}
