import { useMemo } from 'react'
import { create } from 'zustand'
import type { Card, GameId } from '../shared/types'
import { GAME_LIST } from '../shared/games/registry'
import { orderGames } from '../shared/gameOrder'
import { pruneDetails } from '../shared/copyDetails'
import { ownedIndexOf, type AppState } from './storeUtils'
import { createStoreContext } from './storeContext'
import { createAppSlice } from './slices/app'
import { createCatalogSlice } from './slices/catalog'
import { createDecksSlice } from './slices/decks'
import { createBindersSlice } from './slices/binders'
import { createCollectionSlice } from './slices/collection'
import { createAccountsSlice } from './slices/accounts'

export { ownedIndexOf, wishlistIndexOf, type AppState, type ImportBackupResult } from './storeUtils'

/**
 * The app's state and actions, one store made of slices (src/state/slices/) that share the helpers in
 * storeContext.ts. Components use it through this hook as before.
 */
export const useAppStore = create<AppState>((set, get) => {
  const ctx = createStoreContext(set, get)
  return {
    ...createAppSlice(ctx),
    ...createCatalogSlice(ctx),
    ...createDecksSlice(ctx),
    ...createBindersSlice(ctx),
    ...createCollectionSlice(ctx),
    ...createAccountsSlice(ctx),
  }
})

// Copy details follow the collection: removing copies (or a whole card) trims the details recorded
// for them, the plain copies going first (copyDetails.ts copyBreakdown).
useAppStore.subscribe((state, previous) => {
  if (state.collection === previous.collection || !state.settings.collectionDetails) return
  const pruned = pruneDetails(state.settings.collectionDetails, state.collection)
  if (pruned === state.settings.collectionDetails) return
  useAppStore.setState((s) => ({ settings: { ...s.settings, collectionDetails: pruned } }))
  window.api.settings.set({ collectionDetails: pruned }).catch((err) => console.error("Couldn't save copy details:", err))
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
