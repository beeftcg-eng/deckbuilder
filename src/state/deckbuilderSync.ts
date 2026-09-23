import { useEffect } from 'react'
import { useAppStore } from './useAppStore'

/** Re-fetches decks/collection/wishlist/for-trade whenever this app's own background sync (not
 * the trading feature) applies a pull - e.g. a deck added on the phone shows up on desktop
 * without needing a restart. See shared/sync/engine.ts and electron/ipc/deckbuilderSync.ts /
 * web/webApi.ts for the two platforms' sides of firing this. */
export function useDeckbuilderSyncListener() {
  const loadDecks = useAppStore((s) => s.loadDecks)
  const loadBinders = useAppStore((s) => s.loadBinders)
  const loadWishlist = useAppStore((s) => s.loadWishlist)
  const loadCollection = useAppStore((s) => s.loadCollection)
  const loadForTrade = useAppStore((s) => s.loadForTrade)

  useEffect(() => {
    return window.api.pawmodoro.onSyncPulled(() => {
      void loadDecks()
      void loadBinders()
      void loadWishlist()
      void loadCollection()
      void loadForTrade()
    })
  }, [loadDecks, loadBinders, loadWishlist, loadCollection, loadForTrade])
}
