import { useEffect, useState } from 'react'
import { useAppStore, GAME_LIST } from '../state/useAppStore'

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
  const loadMeta = useAppStore((s) => s.loadMeta)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const showWishlist = useAppStore((s) => s.showWishlist)
  const setShowWishlist = useAppStore((s) => s.setShowWishlist)
  const wishlist = useAppStore((s) => s.wishlist)
  const exportBackup = useAppStore((s) => s.exportBackup)
  const importBackup = useAppStore((s) => s.importBackup)
  const [backupStatus, setBackupStatus] = useState<string | null>(null)

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

  const gameDecks = decks.filter((d) => d.gameId === currentGameId)

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
    if (!confirm('This replaces every deck and wishlist entry on this machine with what\'s in the backup file. Continue?')) return
    setBackupStatus(null)
    try {
      const result = await importBackup()
      if (result.imported) {
        setBackupStatus(`Restored ${result.deckCount} deck(s), ${result.wishlistCount} wishlist card(s).`)
      } else if (result.error) {
        setBackupStatus(result.error)
      }
    } catch (err) {
      setBackupStatus(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-title">Deckbuilder</div>

      <button className={`wishlist-nav-btn ${showWishlist ? 'active' : ''}`} onClick={() => setShowWishlist(!showWishlist)}>
        ★ Wishlist{wishlist.length > 0 ? ` (${wishlist.reduce((n, e) => n + e.quantity, 0)})` : ''}
      </button>

      <nav className="game-tabs">
        {GAME_LIST.map((adapter) => (
          <button
            key={adapter.id}
            className={`game-tab ${adapter.id === currentGameId ? 'active' : ''}`}
            onClick={() => setGame(adapter.id)}
          >
            {adapter.shortName}
          </button>
        ))}
      </nav>

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
        <button
          className="btn"
          onClick={() => {
            setShowWishlist(false)
            createDeck(currentGameId)
          }}
        >
          + New
        </button>
      </div>
      <div className="deck-list">
        {gameDecks.length === 0 && <div className="text-dim deck-list-empty">No decks yet.</div>}
        {gameDecks.map((deck) => (
          <div
            key={deck.id}
            className={`deck-row ${deck.id === currentDeckId ? 'active' : ''}`}
            onClick={() => {
              setShowWishlist(false)
              selectDeck(deck.id)
            }}
          >
            <span className="deck-row-name">{deck.name}</span>
            <button
              className="deck-row-delete"
              title="Delete deck"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete "${deck.name}"? This cannot be undone.`)) deleteDeck(deck.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="backup-box">
        <div className="backup-box-title">Backup decks &amp; wishlist</div>
        <div className="backup-actions">
          <button className="btn" onClick={handleBackupExport}>
            Backup…
          </button>
          <button className="btn" onClick={handleBackupImport}>
            Restore…
          </button>
        </div>
        {backupStatus && <div className="text-dim">{backupStatus}</div>}
      </div>
    </aside>
  )
}
