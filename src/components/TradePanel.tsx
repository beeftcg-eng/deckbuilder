import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import type { TradeMatch, TraderProfile } from '../shared/types'

type Tab = 'profile' | 'browse' | 'matches'

function gameShortName(gameId: string): string {
  try {
    return getAdapter(gameId as Parameters<typeof getAdapter>[0]).shortName
  } catch {
    return gameId
  }
}

/** Opt-in profile visibility, a browsable list of other public collections/for-trade cards, and computed trade matches. */
export function TradePanel() {
  const pawmodoroConfig = useAppStore((s) => s.pawmodoroConfig)
  const loadPawmodoroConfig = useAppStore((s) => s.loadPawmodoroConfig)
  const tradeProfile = useAppStore((s) => s.settings.tradeProfile)
  const setTradeVisibility = useAppStore((s) => s.setTradeVisibility)
  const syncTradeData = useAppStore((s) => s.syncTradeData)
  const tradeSyncing = useAppStore((s) => s.tradeSyncing)
  const forTradeCount = useAppStore((s) => s.forTrade.size)
  const browseTraders = useAppStore((s) => s.browseTraders)
  const loadBrowseTraders = useAppStore((s) => s.loadBrowseTraders)
  const tradeMatches = useAppStore((s) => s.tradeMatches)
  const loadTradeMatches = useAppStore((s) => s.loadTradeMatches)

  const [tab, setTab] = useState<Tab>('profile')
  const [displayName, setDisplayName] = useState(tradeProfile?.displayName ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    loadPawmodoroConfig()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setDisplayName(tradeProfile?.displayName ?? '')
  }, [tradeProfile?.displayName])

  useEffect(() => {
    if (!pawmodoroConfig.connected || !tradeProfile?.public) return
    if (tab !== 'browse' && tab !== 'matches') return
    setLoadingList(true)
    setLoadError(null)
    const load = tab === 'browse' ? loadBrowseTraders : loadTradeMatches
    load()
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoadingList(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, pawmodoroConfig.connected, tradeProfile?.public])

  async function handleTogglePublic(next: boolean) {
    setSavingProfile(true)
    setSyncMessage(null)
    try {
      const name = displayName.trim() || pawmodoroConfig.email.split('@')[0] || 'Trader'
      setDisplayName(name)
      await setTradeVisibility(next, name)
      setSyncMessage(next ? 'You’re now visible to other connected accounts.' : 'You’re private again — others can no longer see your collection.')
    } catch (err) {
      setSyncMessage(`Couldn't update: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleSync() {
    setSyncMessage(null)
    try {
      const { skipped } = await syncTradeData()
      setSyncMessage(skipped > 0 ? `Synced. ${skipped} card${skipped === 1 ? '' : 's'} skipped (sync that game's card data to include them).` : 'Synced.')
    } catch (err) {
      setSyncMessage(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const needle = query.trim().toLowerCase()
  const filteredTraders = useMemo(() => {
    if (!needle) return browseTraders
    return browseTraders.filter(
      (t) =>
        t.displayName.toLowerCase().includes(needle) ||
        t.collection.some((c) => c.cardName.toLowerCase().includes(needle)) ||
        t.wants.some((c) => c.cardName.toLowerCase().includes(needle)),
    )
  }, [browseTraders, needle])

  if (!pawmodoroConfig.connected) {
    return (
      <div className="wishlist-panel">
        <div className="wishlist-header">
          <h2>Trade</h2>
        </div>
        <div className="text-dim">
          Trading uses the same Pawmodoro account as the Card Wishlist push. Connect it from the <b>Wishlist</b> tab first, then come back here.
        </div>
      </div>
    )
  }

  return (
    <div className="wishlist-panel">
      <div className="wishlist-header">
        <h2>Trade</h2>
        <span className="text-dim">{forTradeCount} card{forTradeCount === 1 ? '' : 's'} marked for trade</span>
      </div>

      <div className="fv-modes col-tabs" role="tablist">
        <button className={tab === 'profile' ? 'btn btn-primary' : 'btn'} aria-pressed={tab === 'profile'} onClick={() => setTab('profile')}>
          My profile
        </button>
        <button className={tab === 'browse' ? 'btn btn-primary' : 'btn'} aria-pressed={tab === 'browse'} onClick={() => setTab('browse')}>
          Browse
        </button>
        <button className={tab === 'matches' ? 'btn btn-primary' : 'btn'} aria-pressed={tab === 'matches'} onClick={() => setTab('matches')}>
          Matches{tradeMatches.length > 0 ? ` (${tradeMatches.length})` : ''}
        </button>
      </div>

      {tab === 'profile' && (
        <div className="pawmodoro-box">
          <div className="pawmodoro-box-title">Visible to others</div>
          <div className="text-dim">
            Off by default. Turning this on shares your whole collection (with which cards are marked "for trade" in the Collection tab) and your
            wishlist with anyone else who's connected their Pawmodoro account and turned it on too — including your email, so a match can actually
            reach you.
          </div>
          <div className="pawmodoro-form">
            <input placeholder="Name shown to others" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={savingProfile} />
            <button className={tradeProfile?.public ? 'btn' : 'btn btn-primary'} disabled={savingProfile} onClick={() => handleTogglePublic(!tradeProfile?.public)}>
              {savingProfile ? 'Saving…' : tradeProfile?.public ? 'Make private' : 'Make visible'}
            </button>
            {tradeProfile?.public && (
              <button className="btn" disabled={tradeSyncing} onClick={handleSync}>
                {tradeSyncing ? 'Syncing…' : 'Sync my trade list now'}
              </button>
            )}
          </div>
          {syncMessage && <div className="text-dim">{syncMessage}</div>}
          {tradeProfile?.public && (
            <div className="text-dim">
              Mark cards "for trade" from the <b>Collection</b> tab, then press <b>Sync my trade list now</b> to push changes — they don't push
              automatically yet.
            </div>
          )}
        </div>
      )}

      {(tab === 'browse' || tab === 'matches') && !tradeProfile?.public && (
        <div className="text-dim">Turn on "Visible to others" under My profile first — Browse and Matches only work once you're connected both ways.</div>
      )}

      {(tab === 'browse' || tab === 'matches') && tradeProfile?.public && (
        <>
          {loadingList && <div className="text-dim">Loading…</div>}
          {loadError && <div className="sync-error">Couldn't load: {loadError}</div>}

          {tab === 'browse' && !loadingList && (
            <>
              <input className="search-input" placeholder="Search traders or cards…" value={query} onChange={(e) => setQuery(e.target.value)} />
              {filteredTraders.length === 0 && <div className="text-dim">No one else is visible yet — invite friends to turn on trading too.</div>}
              <div className="wishlist-groups">
                {filteredTraders.map((trader) => (
                  <TraderCard key={trader.userId} trader={trader} />
                ))}
              </div>
            </>
          )}

          {tab === 'matches' && !loadingList && (
            <>
              {tradeMatches.length === 0 && (
                <div className="text-dim">No matches yet — a match needs someone else to want a card you've marked for trade, or vice versa.</div>
              )}
              <div className="wishlist-groups">
                {tradeMatches.map((match) => (
                  <MatchCard key={match.userId} match={match} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function TraderCard({ trader }: { trader: TraderProfile }) {
  const [expanded, setExpanded] = useState(false)
  const forTrade = trader.collection.filter((c) => c.forTrade)
  const restOfCollection = trader.collection.filter((c) => !c.forTrade)

  return (
    <div className="wishlist-group">
      <div className="wishlist-group-header">
        {trader.displayName || trader.email} <span className="text-dim">— {trader.email}</span>
      </div>
      {forTrade.length === 0 && trader.wants.length === 0 && <div className="text-dim">Nothing marked for trade or wanted yet.</div>}
      {forTrade.length > 0 && (
        <div>
          <div className="text-dim">For trade ({forTrade.length}):</div>
          {forTrade.map((c) => (
            <div key={`${c.gameId}:${c.cardId}`} className="wishlist-row">
              <span className="wishlist-row-name">
                {c.cardName} <span className="text-dim">— {gameShortName(c.gameId)} · {c.setCode} · {c.quantity}×</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {trader.wants.length > 0 && (
        <div>
          <div className="text-dim">Wants ({trader.wants.length}):</div>
          {trader.wants.map((c) => (
            <div key={`${c.gameId}:${c.cardId}`} className="wishlist-row">
              <span className="wishlist-row-name">
                {c.cardName} <span className="text-dim">— {gameShortName(c.gameId)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {restOfCollection.length > 0 && (
        <button className="link-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Hide' : 'Show'} the rest of their collection ({restOfCollection.length})
        </button>
      )}
      {expanded &&
        restOfCollection.map((c) => (
          <div key={`${c.gameId}:${c.cardId}`} className="wishlist-row">
            <span className="wishlist-row-name">
              {c.cardName} <span className="text-dim">— {gameShortName(c.gameId)} · {c.setCode} · {c.quantity}×</span>
            </span>
          </div>
        ))}
    </div>
  )
}

function MatchCard({ match }: { match: TradeMatch }) {
  return (
    <div className="wishlist-group">
      <div className="wishlist-group-header">
        {match.mutual ? '🤝 ' : ''}
        {match.displayName || match.email} <span className="text-dim">— {match.email}</span>
      </div>
      {match.theyHaveWhatIWant.length > 0 && (
        <div className="text-dim">They have what you want: {match.theyHaveWhatIWant.map((c) => c.cardName).join(', ')}</div>
      )}
      {match.iHaveWhatTheyWant.length > 0 && (
        <div className="text-dim">You have what they want: {match.iHaveWhatTheyWant.map((c) => c.cardName).join(', ')}</div>
      )}
    </div>
  )
}
