import { useEffect, useState } from 'react'
import './app.css'
import { Sidebar } from './components/Sidebar'
import { CardBrowser } from './components/CardBrowser'
import { DeckPanel } from './components/DeckPanel'
import { WishlistPanel } from './components/WishlistPanel'
import { CollectionPanel } from './components/CollectionPanel'
import { MyDecksPanel } from './components/MyDecksPanel'
import { TradePanel } from './components/TradePanel'
import { BinderPanel } from './components/BinderPanel'
import { DeckViewPage } from './components/DeckViewPage'
import { useAppStore } from './state/useAppStore'
import { useSyncProgressListener } from './state/syncProgress'
import { useUpdaterListener } from './state/updater'
import { useDeckbuilderSyncListener } from './state/deckbuilderSync'
import { currentDeckFor } from './shared/decks'
import { UpdateBanner } from './components/UpdateBanner'

export default function App() {
  const initialize = useAppStore((s) => s.initialize)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const error = useAppStore((s) => s.error)
  const setError = useAppStore((s) => s.setError)
  const currentGameId = useAppStore((s) => s.currentGameId)
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const hasCurrentDeck = useAppStore((s) => currentDeckFor(s.decks, s.currentDeckId, s.currentGameId) !== undefined)
  const showWishlist = useAppStore((s) => s.showWishlist)
  const showCollection = useAppStore((s) => s.showCollection)
  const showMyDecks = useAppStore((s) => s.showMyDecks)
  const showTrade = useAppStore((s) => s.showTrade)
  const showBinders = useAppStore((s) => s.showBinders)
  const deckViewing = useAppStore((s) => s.deckViewing)
  const catalogs = useAppStore((s) => s.catalogs)
  const syncMeta = useAppStore((s) => s.syncMeta)

  const viewingDeck = deckViewing && hasCurrentDeck && !showMyDecks && !showCollection && !showWishlist && !showTrade && !showBinders
  // On mobile (app.css), a side panel takes the whole screen instead of squeezing next to the
  // card browser - there's no room for both, and the browser being visible above a panel just
  // buries it below however many cards happen to be loaded. Desktop is unaffected: this class
  // only does anything inside the mobile media query.
  const hasSidePanel = viewingDeck || showMyDecks || showCollection || showWishlist || showTrade || showBinders
  // Only meaningful below the mobile breakpoint (app.css) - the sidebar is always visible on
  // desktop regardless of this. Any navigation inside the sidebar (picking a game/deck, opening
  // a panel) closes it so the tap that navigated also gets you to the content.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useSyncProgressListener()
  useUpdaterListener()
  useDeckbuilderSyncListener()

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

  // Closes the mobile drawer whenever the sidebar's own actions changed what's showing, so the
  // tap that navigated also gets you to the content instead of leaving the drawer open over it.
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [currentGameId, currentDeckId, showMyDecks, showCollection, showWishlist, showTrade, showBinders])

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
      <UpdateBanner />
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileSidebarOpen((v) => !v)}
        aria-label={mobileSidebarOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileSidebarOpen}
      >
        {mobileSidebarOpen ? '✕' : '☰'}
      </button>
      {mobileSidebarOpen && <div className="mobile-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />}
      <div className={`sidebar-wrap ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <Sidebar />
      </div>
      <main className={`app-main ${viewingDeck ? 'app-main-viewing' : ''} ${hasSidePanel ? 'app-main-has-panel' : ''}`}>
        <CardBrowser />
        {showMyDecks ? (
          <MyDecksPanel />
        ) : showCollection ? (
          <CollectionPanel />
        ) : showWishlist ? (
          <WishlistPanel />
        ) : showTrade ? (
          <TradePanel />
        ) : showBinders ? (
          <BinderPanel />
        ) : hasCurrentDeck ? (
          deckViewing ? <DeckViewPage /> : <DeckPanel />
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
