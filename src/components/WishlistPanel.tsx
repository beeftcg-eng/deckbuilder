import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { formatPrice, totalPrice } from '../shared/collection'
import type { ResolvedWishlistEntry } from '../shared/export'
import { WishlistExportModal } from './WishlistExportModal'
import type { GameId, WishlistEntry } from '../shared/types'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../shared/pawmodoroDefaults'

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
  const connectPawmodoro = useAppStore((s) => s.connectPawmodoro)
  const disconnectPawmodoro = useAppStore((s) => s.disconnectPawmodoro)
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

  const [url, setUrl] = useState(pawmodoroConfig.url)
  const [anonKey, setAnonKey] = useState(pawmodoroConfig.anonKey)
  const [email, setEmail] = useState(pawmodoroConfig.email)
  const [password, setPassword] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [pushResult, setPushResult] = useState<string | null>(null)
  const [pushError, setPushError] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  // Only show the project fields expanded if this install already points somewhere other than the shared project.
  const customProject = pawmodoroConfig.url !== DEFAULT_PAWMODORO_URL || pawmodoroConfig.anonKey !== DEFAULT_PAWMODORO_ANON_KEY

  useEffect(() => {
    setUrl(pawmodoroConfig.url)
    setAnonKey(pawmodoroConfig.anonKey)
    setEmail(pawmodoroConfig.email)
  }, [pawmodoroConfig.url, pawmodoroConfig.anonKey, pawmodoroConfig.email])

  async function handleConnect(signUp: boolean) {
    setConnecting(true)
    setConnectError(null)
    try {
      await connectPawmodoro(url.trim(), anonKey.trim(), email.trim(), password, signUp)
      setPassword('')
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

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
      setPushResult(
        `Pushed ${pushedCount} card${pushedCount === 1 ? '' : 's'}${failedCount ? `, ${failedCount} failed` : ''} to your Pawmodoro checklist.`,
      )
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="wishlist-panel">
      <div className="wishlist-header">
        <h2>Card Wishlist</h2>
        <div className="wishlist-header-actions">
          <span className="text-dim">
            {wishlist.reduce((n, e) => n + e.quantity, 0)} card{wishlist.reduce((n, e) => n + e.quantity, 0) === 1 ? '' : 's'} wanted
          </span>
          {wishlistPrice.total > 0 && (
            <span className="text-dim" title="Sum of TCGplayer market prices; cards without a price aren't counted">
              ≈ {formatPrice(wishlistPrice.total)}
            </span>
          )}
          <button className="btn" onClick={() => setShowExport(true)} disabled={wishlist.length === 0}>
            Export
          </button>
        </div>
      </div>

      {showExport && <WishlistExportModal entries={resolvedEntries} onClose={() => setShowExport(false)} />}

      <div className="pawmodoro-box">
        <div className="pawmodoro-box-title">Pawmodoro Cloud Sync</div>
        {pawmodoroConfig.connected ? (
          <>
            <div className="text-dim">Connected as {pawmodoroConfig.email}</div>
            <div className="wishlist-actions">
              <button className="btn btn-primary" onClick={handlePush} disabled={pushingWishlist || unpushed.length === 0}>
                {pushingWishlist ? 'Pushing…' : `Push ${unpushed.length} new card${unpushed.length === 1 ? '' : 's'} to checklist`}
              </button>
              <button className="btn" onClick={disconnectPawmodoro}>
                Disconnect
              </button>
            </div>
            {pushResult && <div className="text-dim">{pushResult}</div>}
            {pushError && <div className="sync-error">Couldn't push to Pawmodoro: {pushError}</div>}
          </>
        ) : (
          <>
            <div className="text-dim">
              New here? Enter an email and password and press Create account. Already have a Pawmodoro login (phone or desktop)? Use the same one and press Connect.
            </div>
            <div className="pawmodoro-form">
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn btn-primary" onClick={() => handleConnect(false)} disabled={connecting || !email.trim() || !password}>
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button className="btn" onClick={() => handleConnect(true)} disabled={connecting || !email.trim() || !password}>
                Create account
              </button>
            </div>
            <details className="pawmodoro-advanced" open={customProject}>
              <summary>Use a different project</summary>
              <div className="pawmodoro-form">
                <input placeholder="Project URL (https://xxxx.supabase.co)" value={url} onChange={(e) => setUrl(e.target.value)} />
                <input placeholder="anon public key" value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
              </div>
            </details>
            {connectError && <div className="sync-error">Couldn't connect: {connectError}</div>}
          </>
        )}
      </div>

      <div className="wishlist-groups">
        {wishlist.length === 0 && (
          <div className="text-dim">No cards wishlisted yet — click the ☆ on any card in the browser to add it here.</div>
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
                      <span className="wishlist-pushed" title="Already on your Pawmodoro checklist">
                        ✓ in Pawmodoro
                      </span>
                    )}
                    {card?.price != null && <span className="text-dim">{formatPrice(card.price * entry.quantity)}</span>}
                    <button className="btn" title="Move to your collection and take it off the wishlist" onClick={() => markGotIt(entry.id)}>
                      ✓ Got it
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
                    <button className="deck-row-delete" title="Remove from wishlist" onClick={() => removeFromWishlist(entry.id)}>
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
