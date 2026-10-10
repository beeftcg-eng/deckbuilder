import { lazy, Suspense, useEffect, useRef, useState } from 'react'
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
import { WelcomeTour } from './components/WelcomeTour'
import { AnnouncementModal } from './components/AnnouncementModal'
import { MobileNav, type MobileView } from './components/MobileNav'
import { SharedDeckView } from './components/SharedDeckView'
import { ShortcutsModal } from './components/ShortcutsModal'
import { ErrorBoundary } from './components/ErrorBoundary'
import { hoveredCard, isTyping } from './lib/shortcuts'

// The card scanner and its OCR models load only when it's first opened.
const ScannerModal = __SCANNER__ ? lazy(() => import('./components/ScannerModal')) : null
import { t } from './shared/i18n'

export default function App() {
  const initialize = useAppStore((s) => s.initialize)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const error = useAppStore((s) => s.error)
  const notice = useAppStore((s) => s.notice)
  const setNotice = useAppStore((s) => s.setNotice)
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
  // Keying the screens on it re-mounts them on a language change, so every string (and memoized legality message) is redone.
  const language = useAppStore((s) => s.language)
  // Prices are formatted at render time; re-mounting on a currency (or rate) change redoes them all.
  const currencyKey = useAppStore((s) => s.currencyKey)
  const showTour = useAppStore((s) => s.showTour)
  const showScanner = useAppStore((s) => s.showScanner)
  const showShortcuts = useAppStore((s) => s.showShortcuts)

  // Switching screens or decks gives a crashed panel a fresh try.
  const panelKey = `${currentGameId}|${currentDeckId}|${deckViewing}|${showMyDecks}|${showCollection}|${showWishlist}|${showTrade}|${showBinders}`

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
  // Phone only: with a deck open for editing, the card browser and the deck are two screens
  // (the Cards and Deck tabs) instead of the deck sitting below every loaded card. Desktop shows
  // both side by side whatever this says - the classes it sets only do anything in app.css's
  // mobile media query.
  const [mobileView, setMobileView] = useState<MobileView>('cards')
  const cardsScrollY = useRef(0)

  useSyncProgressListener()
  useUpdaterListener()
  useDeckbuilderSyncListener()

  useEffect(() => {
    initialize()
  }, [initialize])

  // Keyboard shortcuts (ShortcutsModal.tsx lists them). Ctrl/Cmd+Z undoes the last deck change, but
  // not while typing, where it should undo the text; the rest are desktop-only and also stay out of
  // the way while typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = isTyping(e.target)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (typing) return
        e.preventDefault()
        void useAppStore.getState().undo()
        return
      }
      if (__WEB__ || typing || e.ctrlKey || e.metaKey || e.altKey) return
      const store = useAppStore.getState()
      if (e.key === 'Escape') {
        // The window on top: every modal closes when its backdrop is clicked.
        const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay')
        if (overlays.length > 0) overlays[overlays.length - 1].click()
        else if (store.sharedDeckState) store.closeSharedDeck()
        return
      }
      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>('.card-browser .search-input') ?? document.querySelector<HTMLInputElement>('.search-input')
        if (search) {
          e.preventDefault()
          search.focus()
          search.select()
        }
      } else if (e.key === '+' || e.key === '=') {
        hoveredCard()?.inc()
      } else if (e.key === '-' || e.key === '_') {
        hoveredCard()?.dec()
      } else if (e.key === '?') {
        store.setShowShortcuts(!store.showShortcuts)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Closes the mobile drawer whenever the sidebar's own actions changed what's showing, so the
  // tap that navigated also gets you to the content instead of leaving the drawer open over it.
  useEffect(() => {
    setMobileSidebarOpen(false)
  }, [currentGameId, currentDeckId, showMyDecks, showCollection, showWishlist, showTrade, showBinders])

  // Opening or viewing a deck (sidebar, My Decks, a new deck) lands on the Deck tab.
  useEffect(() => {
    if (currentDeckId) changeMobileView('deck')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDeckId])
  useEffect(() => {
    if (viewingDeck) changeMobileView('deck')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingDeck])

  // The phone page scrolls as a whole, so switching tabs keeps the card list's place and starts
  // everything else at the top.
  function changeMobileView(next: MobileView) {
    if (mobileView === 'cards' && next !== 'cards') cardsScrollY.current = window.scrollY
    setMobileView(next)
    requestAnimationFrame(() => window.scrollTo(0, next === 'cards' ? cardsScrollY.current : 0))
  }

  useEffect(() => {
    const meta = syncMeta[currentGameId]
    if (meta && meta.count > 0 && !catalogs[currentGameId]) {
      loadCatalog(currentGameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGameId, syncMeta[currentGameId]?.count])

  return (
    <div className="app-shell" key={`${language}|${currencyKey}`}>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="deck-row-delete" title={t.common.dismiss} onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}
      {notice && !error && (
        <div className="error-banner notice-banner" role="status">
          <span>{notice}</span>
          <button className="deck-row-delete" title={t.common.dismiss} onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      <UpdateBanner />
      {showTour && <WelcomeTour />}
      <AnnouncementModal />
      <ErrorBoundary area="shared deck">
        <SharedDeckView />
      </ErrorBoundary>
      {showShortcuts && <ShortcutsModal onClose={() => useAppStore.getState().setShowShortcuts(false)} />}
      {ScannerModal && showScanner && (
        <ErrorBoundary area="scanner">
          <Suspense fallback={null}>
            <ScannerModal onClose={() => useAppStore.getState().setShowScanner(false)} />
          </Suspense>
        </ErrorBoundary>
      )}
      <MobileNav
        view={mobileView}
        onViewChange={changeMobileView}
        menuOpen={mobileSidebarOpen}
        onMenuToggle={() => setMobileSidebarOpen((v) => !v)}
      />
      {mobileSidebarOpen && <div className="mobile-sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />}
      <div className={`sidebar-wrap ${mobileSidebarOpen ? 'mobile-open' : ''}`}>
        <ErrorBoundary area="sidebar">
          <Sidebar />
        </ErrorBoundary>
      </div>
      <main className={`app-main ${viewingDeck ? 'app-main-viewing' : ''} ${hasSidePanel ? 'app-main-has-panel' : `mobile-view-${mobileView}`}`}>
        <ErrorBoundary area="card browser" resetKey={currentGameId}>
          <CardBrowser />
        </ErrorBoundary>
        <ErrorBoundary area="panel" resetKey={panelKey}>
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
              <p className="text-dim desktop-only">
                {t.app.welcome1}
                <br />
                {t.app.welcome2}
              </p>
              <div className="mobile-only mobile-welcome">
                <p className="text-dim">{t.mobile.welcome}</p>
                <button className="btn btn-primary" onClick={() => useAppStore.getState().createDeck(currentGameId)}>
                  {t.mobile.newDeck}
                </button>
                <button className="btn" onClick={() => useAppStore.getState().setShowMyDecks(true)}>
                  {t.mobile.myDecks}
                </button>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
