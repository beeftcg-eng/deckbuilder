import { useEffect } from 'react'
import './app.css'
import { Sidebar } from './components/Sidebar'
import { CardBrowser } from './components/CardBrowser'
import { DeckPanel } from './components/DeckPanel'
import { WishlistPanel } from './components/WishlistPanel'
import { useAppStore, GAME_LIST } from './state/useAppStore'
import { useSyncProgressListener } from './state/syncProgress'

export default function App() {
  const loadMeta = useAppStore((s) => s.loadMeta)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const loadDecks = useAppStore((s) => s.loadDecks)
  const loadWishlist = useAppStore((s) => s.loadWishlist)
  const currentGameId = useAppStore((s) => s.currentGameId)
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const showWishlist = useAppStore((s) => s.showWishlist)
  const catalogs = useAppStore((s) => s.catalogs)
  const syncMeta = useAppStore((s) => s.syncMeta)

  useSyncProgressListener()

  useEffect(() => {
    loadDecks()
    loadWishlist()
    for (const adapter of GAME_LIST) loadMeta(adapter.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const meta = syncMeta[currentGameId]
    if (meta && meta.count > 0 && !catalogs[currentGameId]) {
      loadCatalog(currentGameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, syncMeta[currentGameId]?.count])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        {showWishlist ? (
          <WishlistPanel />
        ) : currentDeckId ? (
          <>
            <CardBrowser />
            <DeckPanel />
          </>
        ) : (
          <div className="welcome-screen">
            <h1>Deckbuilder</h1>
            <p className="text-dim">Pick a game and create a deck to get started.</p>
          </div>
        )}
      </main>
    </div>
  )
}
