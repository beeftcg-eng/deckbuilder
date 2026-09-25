import { useEffect, useMemo, useState } from 'react'
import { useAppStore, useCardsById, useOrderedGames, useVisibleGames } from '../state/useAppStore'
import { ImportDeckModal } from './ImportDeckModal'
import { PatchNotesModal } from './PatchNotesModal'
import { PawmodoroAccountModal } from './PawmodoroAccountModal'
import { PairingsAccountModal } from './PairingsAccountModal'
import { canCheckForUpdates, describeUpdate } from '../shared/updateStatus'
import { THEMES, getTheme, themeLabel } from '../shared/themes'
import { resolveDeckIcon } from '../shared/deckIcon'
import { moveBy, reorderByDrop, sortDecks, type DeckSortMode } from '../shared/deckOrder'
import { getAdapter } from '../shared/games/registry'
import type { GameId } from '../shared/types'
import type { Language } from '../shared/i18n'
import { DeckIcon } from './DeckIcon'
import { LANGUAGES, t } from '../shared/i18n'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return t.sidebar.neverSynced
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return t.sidebar.justNow
  if (mins < 60) return t.sidebar.minutesAgo(mins)
  const hours = Math.round(mins / 60)
  if (hours < 24) return t.sidebar.hoursAgo(hours)
  return t.sidebar.daysAgo(Math.round(hours / 24))
}

// With only a few decks a search box is just clutter.
const SEARCH_THRESHOLD = 5

export function Sidebar() {
  const currentGameId = useAppStore((s) => s.currentGameId)
  const setGame = useAppStore((s) => s.setGame)
  const syncMeta = useAppStore((s) => s.syncMeta)
  const syncProgress = useAppStore((s) => s.syncProgress)
  const syncCatalog = useAppStore((s) => s.syncCatalog)
  const decks = useAppStore((s) => s.decks)
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const selectDeck = useAppStore((s) => s.selectDeck)
  const createDeck = useAppStore((s) => s.createDeck)
  const deleteDeck = useAppStore((s) => s.deleteDeck)
  const duplicateDeck = useAppStore((s) => s.duplicateDeck)
  const undo = useAppStore((s) => s.undo)
  const undoLabel = useAppStore((s) => s.undoStack.at(-1)?.label ?? null)
  const deckSort = useAppStore((s) => s.settings.deckSort ?? 'recent')
  const setDeckSort = useAppStore((s) => s.setDeckSort)
  const deckOrder = useAppStore((s) => s.settings.deckOrder)
  const reorderDecks = useAppStore((s) => s.reorderDecks)
  const showMyDecks = useAppStore((s) => s.showMyDecks)
  const setShowMyDecks = useAppStore((s) => s.setShowMyDecks)
  const orderedGames = useOrderedGames()
  const visibleGames = useVisibleGames()
  const hiddenGames = useAppStore((s) => s.settings.hiddenGames)
  const setGameOrder = useAppStore((s) => s.setGameOrder)
  const setGameHidden = useAppStore((s) => s.setGameHidden)
  const [showGameManage, setShowGameManage] = useState(false)
  const [dragGameId, setDragGameId] = useState<GameId | null>(null)
  const [gameDrop, setGameDrop] = useState<{ id: GameId; position: 'before' | 'after' } | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'before' | 'after' } | null>(null)
  const loadMeta = useAppStore((s) => s.loadMeta)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const showWishlist = useAppStore((s) => s.showWishlist)
  const setShowWishlist = useAppStore((s) => s.setShowWishlist)
  const showCollection = useAppStore((s) => s.showCollection)
  const setShowCollection = useAppStore((s) => s.setShowCollection)
  const showTrade = useAppStore((s) => s.showTrade)
  const setShowTrade = useAppStore((s) => s.setShowTrade)
  const showBinders = useAppStore((s) => s.showBinders)
  const setShowBinders = useAppStore((s) => s.setShowBinders)
  const binders = useAppStore((s) => s.binders)
  const collectionCopies = useAppStore((s) => Object.values(s.collection).reduce((n, q) => n + q, 0))
  const wishlist = useAppStore((s) => s.wishlist)
  const exportBackup = useAppStore((s) => s.exportBackup)
  const importBackup = useAppStore((s) => s.importBackup)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const themeId = useAppStore((s) => getTheme(s.settings.theme).id)
  const setTheme = useAppStore((s) => s.setTheme)
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const setShowTour = useAppStore((s) => s.setShowTour)
  const cardsById = useCardsById(currentGameId)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [deckFilter, setDeckFilter] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showPatchNotes, setShowPatchNotes] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [showPairings, setShowPairings] = useState(false)
  const pairingsConfig = useAppStore((s) => s.pairingsConfig)
  const pawmodoroConfig = useAppStore((s) => s.pawmodoroConfig)
  const loadPawmodoroConfig = useAppStore((s) => s.loadPawmodoroConfig)

  useEffect(() => {
    loadPawmodoroConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meta = syncMeta[currentGameId]
  const progress = syncProgress[currentGameId]
  const isSyncing = progress != null && !progress.done

  useEffect(() => {
    if (progress?.done && !progress.error) {
      loadMeta(currentGameId)
      loadCatalog(currentGameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.done])

  const gameDecks = useMemo(() => decks.filter((d) => d.gameId === currentGameId), [decks, currentGameId])
  const visibleDecks = useMemo(() => {
    const needle = deckFilter.trim().toLowerCase()
    const matching = needle ? gameDecks.filter((d) => d.name.toLowerCase().includes(needle)) : gameDecks
    return sortDecks(matching, deckSort, deckOrder)
  }, [gameDecks, deckFilter, deckSort, deckOrder])
  // The whole list in its current order: what a drag or a ▲▼ click re-arranges (only offered while nothing is filtered out).
  const orderedIds = useMemo(() => sortDecks(gameDecks, deckSort, deckOrder).map((d) => d.id), [gameDecks, deckSort, deckOrder])
  const canReorder = deckFilter.trim() === ''
  const gameIds = useMemo(() => orderedGames.map((g) => g.id), [orderedGames])

  async function handleBackupExport() {
    setBackupStatus(null)
    try {
      const saved = await exportBackup()
      setBackupStatus(saved ? t.common.saved : null)
      if (saved) setTimeout(() => setBackupStatus(null), 2500)
    } catch (err) {
      setBackupStatus(t.sidebar.backupFailed(err instanceof Error ? err.message : String(err)))
    }
  }

  async function handleBackupImport() {
    if (!confirm(t.sidebar.restoreConfirm)) return
    setBackupStatus(null)
    try {
      const result = await importBackup()
      if (result.imported) {
        setBackupStatus(t.sidebar.restored(result.deckCount, result.wishlistCount, result.skipped))
      } else if (result.error) {
        setBackupStatus(result.error)
      }
    } catch (err) {
      setBackupStatus(t.sidebar.restoreFailed(err instanceof Error ? err.message : String(err)))
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Beef’s Brewhouse</div>
      <label className="theme-row" data-tour="settings" title={t.sidebar.themeTitle}>
        <span className="text-dim">{t.sidebar.theme}</span>
        <select value={themeId} onChange={(e) => setTheme(e.target.value)}>
          {THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {themeLabel(theme)}
            </option>
          ))}
        </select>
      </label>
      <label className="theme-row" data-tour="settings" title={t.sidebar.languageTitle}>
        <span className="text-dim">{t.sidebar.language}</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <button
        className="wishlist-nav-btn"
        data-tour="account"
        onClick={() => setShowAccount(true)}
        title={pawmodoroConfig.connected ? t.sidebar.manageAccount : t.sidebar.loginTitle}
      >
        {pawmodoroConfig.connected ? `👤 ${pawmodoroConfig.email}` : t.sidebar.login}
      </button>

      <button
        className="wishlist-nav-btn"
        data-tour="pairings"
        onClick={() => setShowPairings(true)}
        title={
          pairingsConfig.connected ? t.sidebar.pairingsConnectedAs(pairingsConfig.email) : t.sidebar.pairingsHowTo
        }
      >
        {pairingsConfig.connected ? t.sidebar.pairingsConnected : t.sidebar.connectPairings}
      </button>

      <button data-tour="nav" className={`wishlist-nav-btn ${showWishlist ? 'active' : ''}`} onClick={() => setShowWishlist(!showWishlist)}>
        {t.sidebar.wishlist}
        {wishlist.length > 0 ? ` (${wishlist.reduce((n, e) => n + e.quantity, 0)})` : ''}
      </button>

      <button data-tour="nav" className={`wishlist-nav-btn ${showMyDecks ? 'active' : ''}`} onClick={() => setShowMyDecks(!showMyDecks)}>
        {t.sidebar.myDecks}
        {decks.length > 0 ? ` (${decks.length})` : ''}
      </button>

      <button data-tour="nav" className={`wishlist-nav-btn ${showCollection ? 'active' : ''}`} onClick={() => setShowCollection(!showCollection)}>
        {t.sidebar.collection}
        {collectionCopies > 0 ? ` (${collectionCopies})` : ''}
      </button>

      <button data-tour="nav" className={`wishlist-nav-btn ${showTrade ? 'active' : ''}`} onClick={() => setShowTrade(!showTrade)}>
        {t.sidebar.trade}
      </button>

      <button data-tour="nav" className={`wishlist-nav-btn ${showBinders ? 'active' : ''}`} onClick={() => setShowBinders(!showBinders)}>
        {t.sidebar.binders}
        {binders.length > 0 ? ` (${binders.length})` : ''}
      </button>

      <nav className="game-tabs" data-tour="games">
        {visibleGames.map((adapter) => (
          <button
            key={adapter.id}
            className={`game-tab ${adapter.id === currentGameId ? 'active' : ''} ${dragGameId === adapter.id ? 'dragging' : ''} ${gameDrop?.id === adapter.id ? `drop-${gameDrop.position}` : ''}`}
            draggable
            title={t.sidebar.dragGame}
            onClick={() => setGame(adapter.id)}
            onKeyDown={(e) => {
              if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
              e.preventDefault()
              setGameOrder(moveBy(gameIds, adapter.id, e.key === 'ArrowUp' ? -1 : 1))
            }}
            onDragStart={(e) => {
              setDragGameId(adapter.id)
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', adapter.id)
              }
            }}
            onDragOver={(e) => {
              if (!dragGameId || dragGameId === adapter.id) return
              e.preventDefault()
              const rect = e.currentTarget.getBoundingClientRect()
              const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
              if (gameDrop?.id !== adapter.id || gameDrop.position !== position) setGameDrop({ id: adapter.id, position })
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragGameId && dragGameId !== adapter.id) {
                const rect = e.currentTarget.getBoundingClientRect()
                setGameOrder(reorderByDrop(gameIds, dragGameId, adapter.id, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'))
              }
              setDragGameId(null)
              setGameDrop(null)
            }}
            onDragEnd={() => {
              setDragGameId(null)
              setGameDrop(null)
            }}
          >
            {adapter.shortName}
          </button>
        ))}
      </nav>

      <button className="link-btn game-manage-toggle" onClick={() => setShowGameManage(!showGameManage)}>
        {showGameManage ? t.sidebar.done : t.sidebar.manageGames}
      </button>

      {showGameManage && (
        <div className="game-manage">
          {orderedGames.map((adapter) => {
            const hidden = hiddenGames?.includes(adapter.id) ?? false
            const isLastVisible = !hidden && visibleGames.length <= 1
            return (
              <label key={adapter.id} className="game-manage-row" title={isLastVisible ? t.sidebar.lastVisibleGame : undefined}>
                <input
                  type="checkbox"
                  checked={!hidden}
                  disabled={isLastVisible}
                  onChange={(e) => setGameHidden(adapter.id, !e.target.checked)}
                />
                {adapter.name}
              </label>
            )
          })}
        </div>
      )}

      <div className="sync-box" data-tour="sync">
        <div className="sync-status">
          <span>{t.sidebar.cardsCached(meta?.count ?? 0)}</span>
          <span className="text-dim">{formatRelativeTime(meta?.lastSynced ?? null)}</span>
        </div>
        {isSyncing && progress && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: progress.total ? `${Math.min(100, (progress.loaded / progress.total) * 100)}%` : '10%' }}
            />
          </div>
        )}
        {progress?.error && <div className="sync-error">{t.sidebar.syncFailed(progress.error)}</div>}
        <button className="btn" disabled={isSyncing} onClick={() => syncCatalog(currentGameId)}>
          {isSyncing ? t.sidebar.syncing(progress?.loaded ?? 0, progress?.total ?? '?') : meta?.count ? t.sidebar.updateCardData : t.sidebar.syncCardData}
        </button>
      </div>

      <div className="deck-list-header" data-tour="decks">
        <span>{t.sidebar.decks}</span>
        <div className="deck-list-header-actions">
          <button className="btn" onClick={() => setShowImport(true)} title={t.sidebar.importTitle}>
            {t.sidebar.import}
          </button>
          <button
            className="btn"
            onClick={() => {
              setShowWishlist(false)
              setShowCollection(false)
              setShowBinders(false)
              createDeck(currentGameId)
            }}
          >
            {t.sidebar.newDeck}
          </button>
        </div>
      </div>

      {undoLabel && (
        <button className="btn undo-btn" onClick={undo} title={t.sidebar.undoTitle}>
          {t.sidebar.undo(undoLabel)}
        </button>
      )}

      {gameDecks.length >= 2 && (
        <div className="deck-list-tools">
          {gameDecks.length >= SEARCH_THRESHOLD && <input placeholder={t.sidebar.filterDecks} value={deckFilter} onChange={(e) => setDeckFilter(e.target.value)} />}
          <select value={deckSort} onChange={(e) => setDeckSort(e.target.value as DeckSortMode)} title={t.sidebar.sortTitle}>
            <option value="recent">{t.sidebar.sortRecent}</option>
            <option value="name">{t.sidebar.sortName}</option>
            <option value="custom">{t.sidebar.sortCustom}</option>
          </select>
        </div>
      )}

      <div className="deck-list">
        {gameDecks.length === 0 && <div className="text-dim deck-list-empty">{t.sidebar.noDecks}</div>}
        {gameDecks.length > 0 && visibleDecks.length === 0 && <div className="text-dim deck-list-empty">{t.sidebar.noDecksMatch}</div>}
        {visibleDecks.map((deck) => (
          <div
            key={deck.id}
            className={`deck-row ${deck.id === currentDeckId ? 'active' : ''} ${dragId === deck.id ? 'dragging' : ''} ${dropTarget?.id === deck.id ? `drop-${dropTarget.position}` : ''}`}
            draggable={canReorder}
            title={canReorder ? t.sidebar.dragDeck : undefined}
            onDragStart={(e) => {
              setDragId(deck.id)
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', deck.id) // some platforms only start a drag if it carries data
              }
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === deck.id) return
              e.preventDefault()
              const rect = e.currentTarget.getBoundingClientRect()
              const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
              if (dropTarget?.id !== deck.id || dropTarget.position !== position) setDropTarget({ id: deck.id, position })
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragId && dragId !== deck.id) {
                const rect = e.currentTarget.getBoundingClientRect()
                reorderDecks(reorderByDrop(orderedIds, dragId, deck.id, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'))
              }
              setDragId(null)
              setDropTarget(null)
            }}
            onDragEnd={() => {
              setDragId(null)
              setDropTarget(null)
            }}
            onClick={() => {
              setShowWishlist(false)
              setShowCollection(false)
              setShowMyDecks(false)
              setShowBinders(false)
              selectDeck(deck.id)
            }}
          >
            <DeckIcon card={resolveDeckIcon(deck, getAdapter(currentGameId), cardsById)} name={deck.name} />
            <span className="deck-row-name">
              {deck.locked ? '🔒 ' : ''}
              {deck.name}
            </span>
            {canReorder && gameDecks.length > 1 && (
              <span className="deck-row-reorder">
                <button
                  className="deck-row-delete"
                  title={t.common.moveUp}
                  disabled={orderedIds[0] === deck.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    reorderDecks(moveBy(orderedIds, deck.id, -1))
                  }}
                >
                  ▲
                </button>
                <button
                  className="deck-row-delete"
                  title={t.common.moveDown}
                  disabled={orderedIds[orderedIds.length - 1] === deck.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    reorderDecks(moveBy(orderedIds, deck.id, 1))
                  }}
                >
                  ▼
                </button>
              </span>
            )}
            <span className="deck-row-actions">
              <button
                className="deck-row-delete"
                title={t.sidebar.duplicateDeck}
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateDeck(deck.id)
                }}
              >
                ⧉
              </button>
              <button
                className="deck-row-delete"
                disabled={deck.locked}
                title={deck.locked ? t.sidebar.unlockToDelete : t.sidebar.deleteDeck}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(t.sidebar.deleteConfirm(deck.name))) deleteDeck(deck.id)
                }}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="backup-box" data-tour="backup">
        <div className="backup-box-title">{t.sidebar.backupTitle}</div>
        <div className="backup-actions">
          <button className="btn" onClick={handleBackupExport}>
            {t.sidebar.backup}
          </button>
          <button className="btn" onClick={handleBackupImport}>
            {t.sidebar.restore}
          </button>
        </div>
        <button className="btn" onClick={() => window.api.backup.openFolder()} title={t.sidebar.autoBackupsTitle}>
          {t.sidebar.openAutoBackups}
        </button>
        {backupStatus && <div className="text-dim">{backupStatus}</div>}
      </div>

      {updateStatus && (
        <div className="version-box">
          <div className="version-line">
            <span className="text-dim">Beef’s Brewhouse v{updateStatus.version}</span>
            {canCheckForUpdates(updateStatus) && (
              <button className="link-btn" onClick={() => window.api.updater.check()}>
                {t.sidebar.checkUpdates}
              </button>
            )}
          </div>
          {describeUpdate(updateStatus) && <div className={updateStatus.state === 'error' ? 'sync-error' : 'text-dim'}>{describeUpdate(updateStatus)}</div>}
          <div className="version-line">
            <button className="link-btn" onClick={() => setShowPatchNotes(true)}>
              {t.sidebar.patchNotes}
            </button>
            <button className="link-btn" data-tour="replay" onClick={() => setShowTour(true)}>
              {t.tour.replay}
            </button>
            <button
              className="link-btn"
              title={t.sidebar.support}
              onClick={() => window.api.system.openExternal('https://paypal.me/beeftcg')}
            >
              {t.sidebar.supportButton}
            </button>
          </div>
        </div>
      )}

      {showImport && <ImportDeckModal gameId={currentGameId} onClose={() => setShowImport(false)} />}
      {showPatchNotes && <PatchNotesModal onClose={() => setShowPatchNotes(false)} />}
      {showAccount && <PawmodoroAccountModal onClose={() => setShowAccount(false)} />}
      {showPairings && <PairingsAccountModal onClose={() => setShowPairings(false)} />}
    </aside>
  )
}
