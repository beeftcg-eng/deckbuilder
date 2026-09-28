import { useAppStore, useVisibleGames } from '../state/useAppStore'
import { currentDeckFor } from '../shared/decks'
import type { GameId } from '../shared/types'
import { t } from '../shared/i18n'

export type MobileView = 'cards' | 'deck'

type Tab = 'cards' | 'deck' | 'myDecks' | 'wishlist' | 'more'

/**
 * The phone app's top bar (game picker + undo) and bottom tab bar (Cards / Deck / My Decks /
 * Wishlist / More). Both are `display: none` outside the mobile breakpoint in app.css, so the
 * desktop build renders them but never shows them.
 */
export function MobileNav({
  view,
  onViewChange,
  menuOpen,
  onMenuToggle,
}: {
  view: MobileView
  onViewChange: (view: MobileView) => void
  menuOpen: boolean
  onMenuToggle: () => void
}) {
  const currentGameId = useAppStore((s) => s.currentGameId)
  const setGame = useAppStore((s) => s.setGame)
  const visibleGames = useVisibleGames()
  const deck = useAppStore((s) => currentDeckFor(s.decks, s.currentDeckId, s.currentGameId))
  const deckViewing = useAppStore((s) => s.deckViewing)
  const showMyDecks = useAppStore((s) => s.showMyDecks)
  const showWishlist = useAppStore((s) => s.showWishlist)
  const showOther = useAppStore((s) => s.showCollection || s.showTrade || s.showBinders)
  const undo = useAppStore((s) => s.undo)
  const undoLabel = useAppStore((s) => s.undoStack.at(-1)?.label ?? null)

  const deckCount = deck ? Object.values(deck.zones).reduce((n, entries) => n + entries.reduce((m, e) => m + (e.quantity ?? 0), 0), 0) : 0

  const active: Tab = menuOpen
    ? 'more'
    : showMyDecks
      ? 'myDecks'
      : showWishlist
        ? 'wishlist'
        : showOther
          ? 'more'
          : view === 'deck' || (deck && deckViewing)
            ? 'deck'
            : 'cards'

  function closePanels() {
    const s = useAppStore.getState()
    s.setShowMyDecks(false)
    s.setShowWishlist(false)
    s.setShowCollection(false)
    s.setShowTrade(false)
    s.setShowBinders(false)
  }

  function goCards() {
    closePanels()
    // A deck open in the read-only deck view hides the browser; browsing with a deck selected is editing it, same as desktop.
    if (useAppStore.getState().deckViewing) useAppStore.getState().setDeckViewing(false)
    onViewChange('cards')
  }

  function goDeck() {
    closePanels()
    onViewChange('deck')
  }

  const gameName = visibleGames.find((g) => g.id === currentGameId)?.shortName

  return (
    <>
      <header className="mobile-topbar">
        <span className="mobile-brand">Brewhouse</span>
        <select
          className="mobile-game-select"
          aria-label={t.mobile.game}
          value={currentGameId}
          onChange={(e) => setGame(e.target.value as GameId)}
        >
          {!gameName && <option value={currentGameId}>{currentGameId}</option>}
          {visibleGames.map((g) => (
            <option key={g.id} value={g.id}>
              {g.shortName}
            </option>
          ))}
        </select>
        {undoLabel && (
          <button className="mobile-undo" onClick={undo} title={t.sidebar.undo(undoLabel)} aria-label={t.sidebar.undo(undoLabel)}>
            ↶ <span>{t.mobile.undo}</span>
          </button>
        )}
      </header>

      <nav className="mobile-tabbar" aria-label={t.mobile.navigation}>
        <button className={active === 'cards' ? 'active' : ''} aria-current={active === 'cards' ? 'page' : undefined} onClick={goCards}>
          <span className="mobile-tab-icon" aria-hidden>🃏</span>
          <span>{t.mobile.cards}</span>
        </button>
        <button className={active === 'deck' ? 'active' : ''} aria-current={active === 'deck' ? 'page' : undefined} onClick={goDeck}>
          <span className="mobile-tab-icon" aria-hidden>
            📜{deck && <span className="mobile-tab-badge">{deckCount}</span>}
          </span>
          <span className="mobile-tab-label">{deck ? deck.name : t.mobile.deck}</span>
        </button>
        <button
          className={active === 'myDecks' ? 'active' : ''}
          aria-current={active === 'myDecks' ? 'page' : undefined}
          onClick={() => useAppStore.getState().setShowMyDecks(true)}
        >
          <span className="mobile-tab-icon" aria-hidden>🗂</span>
          <span>{t.mobile.myDecks}</span>
        </button>
        <button
          className={active === 'wishlist' ? 'active' : ''}
          aria-current={active === 'wishlist' ? 'page' : undefined}
          onClick={() => useAppStore.getState().setShowWishlist(true)}
        >
          <span className="mobile-tab-icon" aria-hidden>★</span>
          <span>{t.mobile.wishlist}</span>
        </button>
        <button className={active === 'more' ? 'active' : ''} aria-expanded={menuOpen} onClick={onMenuToggle}>
          <span className="mobile-tab-icon" aria-hidden>☰</span>
          <span>{t.mobile.more}</span>
        </button>
      </nav>
    </>
  )
}
