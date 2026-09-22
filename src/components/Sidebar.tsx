import { useEffect, useMemo, useState } from 'react'
import { useAppStore, useCardsById, useOrderedGames, useVisibleGames } from '../state/useAppStore'
import { ImportDeckModal } from './ImportDeckModal'
import { canCheckForUpdates, describeUpdate } from '../shared/updateStatus'
import { THEMES, getTheme } from '../shared/themes'
import { resolveDeckIcon } from '../shared/deckIcon'
import { moveBy, reorderByDrop, sortDecks, type DeckSortMode } from '../shared/deckOrder'
import { getAdapter } from '../shared/games/registry'
import type { GameId } from '../shared/types'
import { DeckIcon } from './DeckIcon'

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never synced'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
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
  const collectionCopies = useAppStore((s) => Object.values(s.collection).reduce((n, q) => n + q, 0))
  const wishlist = useAppStore((s) => s.wishlist)
  const exportBackup = useAppStore((s) => s.exportBackup)
  const importBackup = useAppStore((s) => s.importBackup)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const themeId = useAppStore((s) => getTheme(s.settings.theme).id)
  const setTheme = useAppStore((s) => s.setTheme)
  const cardsById = useCardsById(currentGameId)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)
  const [deckFilter, setDeckFilter] = useState('')
  const [showImport, setShowImport] = useState(false)

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
      setBackupStatus(saved ? 'Saved.' : null)
      if (saved) setTimeout(() => setBackupStatus(null), 2500)
    } catch (err) {
      setBackupStatus(`Backup failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleBackupImport() {
    if (
      !confirm(
        "This replaces the decks, wishlist and collection on this machine with what's in the backup file. A snapshot of the current ones is saved to the backups folder first. Continue?",
      )
    )
      return
    setBackupStatus(null)
    try {
      const result = await importBackup()
      if (result.imported) {
        const skipped = result.skipped > 0 ? ` (${result.skipped} unreadable entr${result.skipped === 1 ? 'y' : 'ies'} skipped)` : ''
        setBackupStatus(`Restored ${result.deckCount} deck(s), ${result.wishlistCount} wishlist card(s)${skipped}.`)
      } else if (result.error) {
        setBackupStatus(result.error)
      }
    } catch (err) {
      setBackupStatus(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Beef’s Brewhouse</div>
      <label className="theme-row" title="Change the app's colours">
        <span className="text-dim">Theme</span>
        <select value={themeId} onChange={(e) => setTheme(e.target.value)}>
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <button className={`wishlist-nav-btn ${showWishlist ? 'active' : ''}`} onClick={() => setShowWishlist(!showWishlist)}>
        ★ Wishlist{wishlist.length > 0 ? ` (${wishlist.reduce((n, e) => n + e.quantity, 0)})` : ''}
      </button>

      <button className={`wishlist-nav-btn ${showMyDecks ? 'active' : ''}`} onClick={() => setShowMyDecks(!showMyDecks)}>
        🗂 My Decks{decks.length > 0 ? ` (${decks.length})` : ''}
      </button>

      <button className={`wishlist-nav-btn ${showCollection ? 'active' : ''}`} onClick={() => setShowCollection(!showCollection)}>
        ▦ Collection{collectionCopies > 0 ? ` (${collectionCopies})` : ''}
      </button>

      <button className={`wishlist-nav-btn ${showTrade ? 'active' : ''}`} onClick={() => setShowTrade(!showTrade)}>
        🔀 Trade
      </button>

      <nav className="game-tabs">
        {visibleGames.map((adapter) => (
          <button
            key={adapter.id}
            className={`game-tab ${adapter.id === currentGameId ? 'active' : ''} ${dragGameId === adapter.id ? 'dragging' : ''} ${gameDrop?.id === adapter.id ? `drop-${gameDrop.position}` : ''}`}
            draggable
            title="Drag to re-order the games (or Alt+↑ / Alt+↓)"
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
        {showGameManage ? 'Done' : 'Manage games…'}
      </button>

      {showGameManage && (
        <div className="game-manage">
          {orderedGames.map((adapter) => {
            const hidden = hiddenGames?.includes(adapter.id) ?? false
            const isLastVisible = !hidden && visibleGames.length <= 1
            return (
              <label key={adapter.id} className="game-manage-row" title={isLastVisible ? 'At least one game must stay visible' : undefined}>
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

      <div className="sync-box">
        <div className="sync-status">
          <span>{meta?.count ?? 0} cards cached</span>
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
        {progress?.error && <div className="sync-error">Sync failed: {progress.error}</div>}
        <button className="btn" disabled={isSyncing} onClick={() => syncCatalog(currentGameId)}>
          {isSyncing ? `Syncing… ${progress?.loaded ?? 0}/${progress?.total ?? '?'}` : meta?.count ? 'Update card data' : 'Sync card data'}
        </button>
      </div>

      <div className="deck-list-header">
        <span>Decks</span>
        <div className="deck-list-header-actions">
          <button className="btn" onClick={() => setShowImport(true)} title="Create a deck from pasted text">
            Import
          </button>
          <button
            className="btn"
            onClick={() => {
              setShowWishlist(false)
              setShowCollection(false)
              createDeck(currentGameId)
            }}
          >
            + New
          </button>
        </div>
      </div>

      {undoLabel && (
        <button className="btn undo-btn" onClick={undo} title="Undo the last deck change (Ctrl+Z)">
          ↶ Undo: {undoLabel}
        </button>
      )}

      {gameDecks.length >= 2 && (
        <div className="deck-list-tools">
          {gameDecks.length >= SEARCH_THRESHOLD && <input placeholder="Filter decks…" value={deckFilter} onChange={(e) => setDeckFilter(e.target.value)} />}
          <select value={deckSort} onChange={(e) => setDeckSort(e.target.value as DeckSortMode)} title="Sort decks — or just drag a deck to put it where you want it">
            <option value="recent">Recent</option>
            <option value="name">A–Z</option>
            <option value="custom">My order</option>
          </select>
        </div>
      )}

      <div className="deck-list">
        {gameDecks.length === 0 && <div className="text-dim deck-list-empty">No decks yet.</div>}
        {gameDecks.length > 0 && visibleDecks.length === 0 && <div className="text-dim deck-list-empty">No decks match.</div>}
        {visibleDecks.map((deck) => (
          <div
            key={deck.id}
            className={`deck-row ${deck.id === currentDeckId ? 'active' : ''} ${dragId === deck.id ? 'dragging' : ''} ${dropTarget?.id === deck.id ? `drop-${dropTarget.position}` : ''}`}
            draggable={canReorder}
            title={canReorder ? 'Drag to re-order' : undefined}
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
                  title="Move up"
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
                  title="Move down"
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
                title="Duplicate deck"
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
                title={deck.locked ? 'Unlock this deck to delete it' : 'Delete deck (Ctrl+Z undoes it)'}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Delete "${deck.name}"?`)) deleteDeck(deck.id)
                }}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>

      <div className="backup-box">
        <div className="backup-box-title">Backup decks, wishlist &amp; collection</div>
        <div className="backup-actions">
          <button className="btn" onClick={handleBackupExport}>
            Backup…
          </button>
          <button className="btn" onClick={handleBackupImport}>
            Restore…
          </button>
        </div>
        <button className="btn" onClick={() => window.api.backup.openFolder()} title="Snapshots are taken automatically on launch and before edits">
          Open auto-backups folder
        </button>
        {backupStatus && <div className="text-dim">{backupStatus}</div>}
      </div>

      {updateStatus && (
        <div className="version-box">
          <div className="version-line">
            <span className="text-dim">Beef’s Brewhouse v{updateStatus.version}</span>
            {canCheckForUpdates(updateStatus) && (
              <button className="link-btn" onClick={() => window.api.updater.check()}>
                Check for updates
              </button>
            )}
          </div>
          {describeUpdate(updateStatus) && <div className={updateStatus.state === 'error' ? 'sync-error' : 'text-dim'}>{describeUpdate(updateStatus)}</div>}
        </div>
      )}

      {showImport && <ImportDeckModal gameId={currentGameId} onClose={() => setShowImport(false)} />}
    </aside>
  )
}
