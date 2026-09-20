import { useEffect } from 'react'
import './app.css'
import { Sidebar } from './components/Sidebar'
import { CardBrowser } from './components/CardBrowser'
import { DeckPanel } from './components/DeckPanel'
import { WishlistPanel } from './components/WishlistPanel'
import { useAppStore } from './state/useAppStore'
import { useSyncProgressListener } from './state/syncProgress'

export default function App() {
  const initialize = useAppStore((s) => s.initialize)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const error = useAppStore((s) => s.error)
  const setError = useAppStore((s) => s.setError)
  const currentGameId = useAppStore((s) => s.currentGameId)
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const showWishlist = useAppStore((s) => s.showWishlist)
  const catalogs = useAppStore((s) => s.catalogs)
  const syncMeta = useAppStore((s) => s.syncMeta)

  useSyncProgressListener()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Ctrl/Cmd+Z undoes the last deck change — but not while typing, where it should undo the text.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return
      const target = e.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return
      e.preventDefault()
      void useAppStore.getState().undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
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
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="deck-row-delete" title="Dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      <Sidebar />
      <main className="app-main">
        <CardBrowser />
        {showWishlist ? (
          <WishlistPanel />
        ) : currentDeckId ? (
          <DeckPanel />
        ) : (
          <div className="welcome-screen">
            <p className="text-dim">
              Pick or create a deck in the sidebar to start building —<br />
              you can still browse and wishlist cards without one.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
