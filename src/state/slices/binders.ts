import type { Binder, Deck } from '../../shared/types'
import { addToBinder, addToDeck, deckMoveProblem, takeFromBinder, takeFromDeck, zoneForCard } from '../../shared/cardMoves'
import { t } from '../../shared/i18n'
import { errorMessage, type AppState } from '../storeUtils'
import type { StoreContext } from '../storeContext'

/** Binders, and moving cards between binders and decks. */
export function createBindersSlice(ctx: StoreContext) {
  const { set, get, persistDeck } = ctx
  return {
    binders: [],
    currentBinderId: null,

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
  } satisfies Partial<AppState>
}
