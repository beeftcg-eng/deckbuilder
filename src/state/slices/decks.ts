import type { AppSettings, Deck, DeckCardEntry, DeckFreeTextEntry } from '../../shared/types'
import { getAdapter } from '../../shared/games/registry'
import { parseDecklistText } from '../../shared/importDeck'
import { SAMPLE_DECKS } from '../../shared/sampleDecks'
import { cheapestPrinting } from '../../shared/buyList'
import { checkDeckLegality } from '../../shared/legality'
import { moveOneCopy, withQuantity } from '../../shared/deckEdits'
import { withTags } from '../../shared/deckTags'
import { shouldSaveBeforeEdit, withVersion, withVersionName, withVersionRestored, withoutVersion } from '../../shared/deckHistory'
import { currentDeckFor } from '../../shared/decks'
import { applyVisibleOrder, reorderByDrop } from '../../shared/deckOrder'
import { getLanguage, t, zoneLabel } from '../../shared/i18n'
import { emptyDeck, errorMessage, type AppState } from '../storeUtils'
import type { StoreContext } from '../storeContext'

/** Decks: editing with undo, locking, notes, folders, history, tags, share links and example decks. */
export function createDecksSlice(ctx: StoreContext) {
  const { set, get, persistSettings, pushUndo, persistDeck, addAndSelectDeck } = ctx
  return {
    decks: [],
    currentDeckId: null,
    deckViewing: false,
    undoStack: [],
    sharedDeck: null,
    sharedDeckState: null,
    sharedDeckError: null,

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
      // Its history stays with the original.
      const { locked: _wasLocked, shareToken: _wasShared, versions: _history, ...unlocked } = structuredClone(source)
      const copy: Deck = { ...unlocked, id: crypto.randomUUID(), name: `${source.name} (copy)`, createdAt: now, updatedAt: now }
      await addAndSelectDeck(copy, `Duplicate "${source.name}"`)
    },

    importDeck: async (gameId, parsed, name, formatId, tags) => {
      const deck: Deck = { ...emptyDeck(gameId, formatId), name, zones: parsed.zones, freeTextZones: parsed.freeTextZones, ...(tags && Object.keys(tags).length ? { tags } : {}) }
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



    updateDeck: async (updater, undoLabel = t.store.editDeck) => {
      const { currentDeckId, currentGameId, decks } = get()
      const current = currentDeckFor(decks, currentDeckId, currentGameId)
      if (!current) return
      if (current.locked) {
        set({ error: t.store.lockedNoChange(current.name) })
        return
      }
      // The first edit after a while saves the list as it stood, so the deck's history has it (deckHistory.ts).
      const base = shouldSaveBeforeEdit(current, Date.now()) ? withVersion(current, { id: crypto.randomUUID(), at: current.updatedAt }) : current
      const next = updater(base)
      if (next === base) return
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
    saveDeckVersion: async (deckId, name) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      const next = withVersion(deck, { id: crypto.randomUUID(), at: new Date().toISOString(), name })
      if (next === deck) return
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    restoreDeckVersion: async (versionId) => {
      const deck = currentDeckFor(get().decks, get().currentDeckId, get().currentGameId)
      const version = deck?.versions?.find((v) => v.id === versionId)
      if (!deck || !version) return
      await get().updateDeck(
        (d) => withVersionRestored(withVersion(d, { id: crypto.randomUUID(), at: new Date().toISOString() }), version),
        t.history.restoreUndo(version.name ?? new Date(version.at).toLocaleDateString(getLanguage())),
      )
    },
    renameDeckVersion: async (deckId, versionId, name) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      const next = withVersionName(deck, versionId, name)
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    setCardTags: async (deckId, card, tags) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      const next = withTags(deck, card, tags)
      if (JSON.stringify(next.tags ?? {}) === JSON.stringify(deck.tags ?? {})) return
      set((s) => ({ decks: s.decks.map((d) => (d.id === deckId ? next : d)) }))
      await persistDeck(next, { keepUpdatedAt: true })
    },
    deleteDeckVersion: async (deckId, versionId) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      const next = withoutVersion(deck, versionId)
      if (next === deck) return
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
    openDeck: (deckId) => {
      const deck = get().decks.find((d) => d.id === deckId)
      if (!deck) return
      set({ currentGameId: deck.gameId, currentDeckId: deckId, showMyDecks: false, showWishlist: false, showCollection: false, showTrade: false, showBinders: false, deckViewing: true })
      persistSettings({ lastGameId: deck.gameId, lastDeckId: deckId })
    },
    setDeckViewMode: (mode) => persistSettings({ deckViewMode: mode }),
    setDeckIcon: async (cardId) => {
      await get().updateDeck((d) => {
        const { iconCardId: _previous, ...rest } = d
        return cardId ? { ...rest, iconCardId: cardId } : rest
      }, cardId ? t.store.setIcon : t.store.clearIcon)
    },
  } satisfies Partial<AppState>
}
