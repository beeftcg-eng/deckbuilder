import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { formatPrice, totalPrice } from '../shared/collection'
import type { ResolvedWishlistEntry } from '../shared/export'
import { WishlistExportModal } from './WishlistExportModal'
import type { GameId, WishlistEntry } from '../shared/types'
import { t } from '../shared/i18n'

export function WishlistPanel() {
  const wishlist = useAppStore((s) => s.wishlist)
  const catalogs = useAppStore((s) => s.catalogs)
  const syncMeta = useAppStore((s) => s.syncMeta)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const setWishlistQuantity = useAppStore((s) => s.setWishlistQuantity)
  const removeFromWishlist = useAppStore((s) => s.removeFromWishlist)
  const markGotIt = useAppStore((s) => s.markGotIt)
  const pawmodoroConfig = useAppStore((s) => s.pawmodoroConfig)
  const loadPawmodoroConfig = useAppStore((s) => s.loadPawmodoroConfig)
  const pushWishlistToPawmodoro = useAppStore((s) => s.pushWishlistToPawmodoro)
  const pushingWishlist = useAppStore((s) => s.pushingWishlist)

  useEffect(() => {
    loadPawmodoroConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The wishlist can span games whose catalog isn't loaded yet (e.g. you
  // wishlisted a card while browsing a different game last session).
  useEffect(() => {
    for (const gameId of new Set(wishlist.map((e) => e.gameId))) {
      const meta = syncMeta[gameId]
      if (meta && meta.count > 0 && !catalogs[gameId]) loadCatalog(gameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wishlist, syncMeta])

  const [pushResult, setPushResult] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)

  const grouped = useMemo(() => {
    const byGame = new Map<GameId, WishlistEntry[]>()
    for (const entry of wishlist) {
      const list = byGame.get(entry.gameId) ?? []
      list.push(entry)
      byGame.set(entry.gameId, list)
    }
    return byGame
  }, [wishlist])

  function taskTextFor(entry: WishlistEntry): string | null {
    const card = catalogs[entry.gameId]?.byId.get(entry.cardId)
    if (!card) return null
    return `${entry.quantity}x ${card.name} (${card.setCode} #${card.number}) — ${getAdapter(entry.gameId).shortName}`
  }

  const resolvedEntries = useMemo<ResolvedWishlistEntry[]>(() => {
    const entries: ResolvedWishlistEntry[] = []
    for (const entry of wishlist) {
      const card = catalogs[entry.gameId]?.byId.get(entry.cardId)
      if (card) entries.push({ card, quantity: entry.quantity })
    }
    return entries
  }, [wishlist, catalogs])

  const wishlistPrice = useMemo(() => totalPrice(resolvedEntries), [resolvedEntries])

  const unpushed = wishlist.filter((e) => !e.pushedTaskId)

  async function handlePush() {
    setPushResult(null)
    const items = unpushed
      .map((e) => ({ entryId: e.id, text: taskTextFor(e) }))
      .filter((i): i is { entryId: string; text: string } => i.text != null)
    if (items.length === 0) return
    setPushError(null)
    try {
      const { pushedCount, failedCount } = await pushWishlistToPawmodoro(items)
      setPushResult(t.wishlist.pushed(pushedCount, failedCount))
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="wishlist-panel">
      <div className="wishlist-header">
        <h2>{t.wishlist.title}</h2>
        <div className="wishlist-header-actions">
          <span className="text-dim">
            {t.wishlist.wanted(wishlist.reduce((n, e) => n + e.quantity, 0))}
          </span>
          {wishlistPrice.total > 0 && (
            <span className="text-dim" title={t.wishlist.priceTitle}>
              ≈ {formatPrice(wishlistPrice.total)}
            </span>
          )}
          <button className="btn" onClick={() => setShowExport(true)} disabled={wishlist.length === 0}>
            {t.wishlist.export}
          </button>
        </div>
      </div>

      {showExport && <WishlistExportModal entries={resolvedEntries} onClose={() => setShowExport(false)} />}

      <div className="pawmodoro-box">
        <div className="pawmodoro-box-title">{t.wishlist.cloudSync}</div>
        {pawmodoroConfig.connected ? (
          <>
            <div className="text-dim">{t.pawmodoro.connectedAs(pawmodoroConfig.email)}</div>
            <div className="wishlist-actions">
              <button className="btn btn-primary" onClick={handlePush} disabled={pushingWishlist || unpushed.length === 0}>
                {pushingWishlist ? t.wishlist.pushing : t.wishlist.push(unpushed.length)}
              </button>
            </div>
            {pushResult && <div className="text-dim">{pushResult}</div>}
            {pushError && <div className="sync-error">{t.wishlist.pushFailed(pushError)}</div>}
          </>
        ) : (
          <div className="text-dim">{t.wishlist.logIn}</div>
        )}
      </div>

      <div className="wishlist-groups">
        {wishlist.length === 0 && (
          <div className="text-dim">{t.wishlist.empty}</div>
        )}
        {[...grouped.entries()].map(([gameId, entries]) => {
          const adapter = getAdapter(gameId)
          const byId = catalogs[gameId]?.byId
          return (
            <div key={gameId} className="wishlist-group">
              <div className="wishlist-group-header">{adapter.shortName}</div>
              {entries.map((entry) => {
                const card = byId?.get(entry.cardId)
                return (
                  <div key={entry.id} className="wishlist-row">
                    {card?.imageUrlSmall ? (
                      <img className="wishlist-thumb" src={card.imageUrlSmall} alt={card.name} />
                    ) : (
                      <div className="wishlist-thumb wishlist-thumb-empty" />
                    )}
                    <div className="wishlist-row-name">
                      {card ? card.name : entry.cardId}
                      {card && (
                        <span className="text-dim">
                          {' '}
                          — {card.setCode} #{card.number}
                          {card.rarity ? ` · ${card.rarity}` : ''}
                        </span>
                      )}
                    </div>
                    {entry.pushedTaskId && (
                      <span className="wishlist-pushed" title={t.wishlist.inPawmodoroTitle}>
                        {t.wishlist.inPawmodoro}
                      </span>
                    )}
                    {card?.price != null && <span className="text-dim">{formatPrice(card.price * entry.quantity)}</span>}
                    <button className="btn" title={t.wishlist.gotItTitle} onClick={() => markGotIt(entry.id)}>
                      {t.wishlist.gotIt}
                    </button>
                    <div className="stepper">
                      <button className="btn stepper-btn" onClick={() => setWishlistQuantity(entry.id, entry.quantity - 1)}>
                        −
                      </button>
                      <span className="stepper-value">{entry.quantity}</span>
                      <button className="btn stepper-btn" onClick={() => setWishlistQuantity(entry.id, entry.quantity + 1)}>
                        +
                      </button>
                    </div>
                    <button className="deck-row-delete" title={t.wishlist.remove} onClick={() => removeFromWishlist(entry.id)}>
                      ×
                    </button>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
