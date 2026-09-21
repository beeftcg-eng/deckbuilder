import { DeckLockButton } from './DeckLockButton'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore, useOrderedGames } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { checkDeckLegality } from '../shared/legality'
import { resolveDeckIcon } from '../shared/deckIcon'
import { sortDecks } from '../shared/deckOrder'
import type { Card, Deck, GameId } from '../shared/types'
import { DeckIcon } from './DeckIcon'

type Sort = 'recent' | 'name' | 'game' | 'custom'

function updatedLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return days < 60 ? `${days}d ago` : new Date(iso).toLocaleDateString()
}

function DeckCard({ deck, cardsById }: { deck: Deck; cardsById: Map<string, Card> | undefined }) {
  const openDeck = useAppStore((s) => s.openDeck)
  const duplicateDeck = useAppStore((s) => s.duplicateDeck)
  const deleteDeck = useAppStore((s) => s.deleteDeck)
  const formats = useAppStore((s) => s.formats[deck.gameId])
  const adapter = getAdapter(deck.gameId)

  const format = useMemo(() => {
    const all = formats ?? adapter.defaultFormats
    return all.find((f) => f.id === deck.formatId) ?? all[0]
  }, [formats, adapter, deck.formatId])
  const zones = useMemo(() => rulesForFormat(adapter, deck.formatId).zones, [adapter, deck.formatId])
  const icon = useMemo(() => (cardsById ? resolveDeckIcon(deck, adapter, cardsById) : null), [deck, adapter, cardsById])
  const legality = useMemo(() => (cardsById && format ? checkDeckLegality(deck, adapter, format, cardsById) : null), [deck, adapter, format, cardsById])

  const counts = zones.flatMap((zone) => {
    const entries = zone.freeText ? (deck.freeTextZones[zone.id] ?? []) : (deck.zones[zone.id] ?? [])
    const total = entries.reduce((sum, e) => sum + e.quantity, 0)
    return total > 0 ? [{ label: zone.label, total, free: !!zone.freeText }] : []
  })
  const totalCards = counts.filter((c) => !c.free).reduce((sum, c) => sum + c.total, 0)

  return (
    <div
      className="md-card"
      role="button"
      tabIndex={0}
      onClick={() => openDeck(deck.id)}
      onKeyDown={(e) => e.key === 'Enter' && openDeck(deck.id)}
      title={`Open "${deck.name}"`}
    >
      <DeckIcon card={icon} name={deck.name} size={72} />
      <div className="md-card-body">
        <div className="md-card-name" title={deck.name}>
          {deck.locked ? '🔒 ' : ''}
          {deck.name}
        </div>
        <div className="text-dim md-card-meta">
          {adapter.shortName}
          {format ? ` · ${format.label}` : ''}
        </div>
        <div className="md-card-counts">
          <b>{totalCards}</b> card{totalCards === 1 ? '' : 's'}
          {counts.length > 1 && <span className="text-dim"> — {counts.map((c) => `${c.label} ${c.total}`).join(' · ')}</span>}
        </div>
        <div className="md-card-foot">
          {legality ? (
            <span className={legality.legal ? 'fv-legal' : 'fv-illegal'} title={legality.issues.map((i) => i.message).join('\n') || undefined}>
              {legality.legal ? '✓ Legal' : `✗ ${legality.issues.length} issue${legality.issues.length === 1 ? '' : 's'}`}
            </span>
          ) : (
            <span className="text-dim" title="Sync this game's card data to check legality">
              legality unchecked
            </span>
          )}
          <span className="text-dim">{updatedLabel(deck.updatedAt)}</span>
        </div>
      </div>
      <div className="md-card-actions">
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
        <DeckLockButton deck={deck} compact />
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
      </div>
    </div>
  )
}

/** Every deck you've built, across all games, on one page: click one to open it. */
export function MyDecksPanel() {
  const decks = useAppStore((s) => s.decks)
  const catalogs = useAppStore((s) => s.catalogs)
  const syncMeta = useAppStore((s) => s.syncMeta)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const deckOrder = useAppStore((s) => s.settings.deckOrder)

  const [query, setQuery] = useState('')
  const [game, setGame] = useState<GameId | 'all'>('all')
  const [sort, setSort] = useState<Sort>('recent')

  // Icons and legality need each game's card data, which is only loaded for the game you're browsing.
  useEffect(() => {
    for (const gameId of new Set(decks.map((d) => d.gameId))) {
      const meta = syncMeta[gameId]
      if (meta && meta.count > 0 && !catalogs[gameId]) loadCatalog(gameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, syncMeta])

  const orderedGames = useOrderedGames()
  const gamesWithDecks = useMemo(() => orderedGames.filter((a) => decks.some((d) => d.gameId === a.id)), [orderedGames, decks])
  const needle = query.trim().toLowerCase()
  const shown = useMemo(() => {
    const matching = decks.filter((d) => (game === 'all' || d.gameId === game) && (!needle || d.name.toLowerCase().includes(needle)))
    if (sort === 'game') {
      const rank = (id: GameId) => orderedGames.findIndex((a) => a.id === id)
      return sortDecks(matching, 'recent').sort((a, b) => rank(a.gameId) - rank(b.gameId))
    }
    return sortDecks(matching, sort, deckOrder)
  }, [decks, game, needle, sort, deckOrder, orderedGames])

  return (
    <div className="wishlist-panel md-panel">
      <div className="wishlist-header">
        <h2>My Decks</h2>
        <span className="text-dim">
          {decks.length} deck{decks.length === 1 ? '' : 's'}
          {gamesWithDecks.length > 1 ? ` across ${gamesWithDecks.length} games` : ''}
        </span>
      </div>

      {decks.length === 0 ? (
        <div className="text-dim">You haven't built any decks yet. Pick a game in the sidebar and click <b>+ New</b> (or <b>Import</b>) to start one.</div>
      ) : (
        <>
          <div className="col-controls">
            <input className="search-input" placeholder="Search your decks…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} title="Sort">
              <option value="recent">Recent</option>
              <option value="name">A–Z</option>
              <option value="game">By game</option>
              <option value="custom">My order</option>
            </select>
          </div>

          {gamesWithDecks.length > 1 && (
            <div className="color-filter-row">
              <button className={`color-chip ${game === 'all' ? 'active' : ''}`} onClick={() => setGame('all')}>
                All
              </button>
              {gamesWithDecks.map((a) => (
                <button key={a.id} className={`color-chip ${game === a.id ? 'active' : ''}`} onClick={() => setGame(a.id)}>
                  {a.shortName} ({decks.filter((d) => d.gameId === a.id).length})
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="text-dim">No decks match.</div>
          ) : (
            <div className="md-grid">
              {shown.map((deck) => (
                <DeckCard key={deck.id} deck={deck} cardsById={catalogs[deck.gameId]?.byId} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
