import { DeckLockButton } from './DeckLockButton'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore, useOrderedGames } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { checkDeckLegality } from '../shared/legality'
import { summarizeRecord } from '../shared/pairingsRecord'
import { resolveDeckIcon } from '../shared/deckIcon'
import { sortDecks } from '../shared/deckOrder'
import type { Card, Deck, GameId } from '../shared/types'
import { DeckIcon } from './DeckIcon'
import { Rich } from './Rich'
import { getLanguage, t, zoneLabel } from '../shared/i18n'
import { formatLabel } from '../shared/formatText'

type Sort = 'recent' | 'name' | 'game' | 'custom'

function updatedLabel(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return t.sidebar.justNow
  if (minutes < 60) return t.sidebar.minutesAgo(minutes)
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t.sidebar.hoursAgo(hours)
  const days = Math.round(hours / 24)
  return days < 60 ? t.sidebar.daysAgo(days) : new Date(iso).toLocaleDateString(getLanguage())
}

/** The deck's tournament record from Pairings, when it has any (see PairingsRecordStrip for the full view). */
function PairingsBadge({ deckId }: { deckId: string }) {
  const results = useAppStore((s) => s.pairingsRecords?.[deckId])
  const summary = useMemo(() => (results?.length ? summarizeRecord(results) : null), [results])
  if (!summary) return null
  const record = `${summary.wins}-${summary.losses}${summary.draws ? `-${summary.draws}` : ''}`
  return (
    <span className="md-record" title={t.myDecks.recordTitle(summary.events, summary.winRate)}>
      🏆 {record}
    </span>
  )
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
    return total > 0 ? [{ label: zoneLabel(zone.label), total, free: !!zone.freeText }] : []
  })
  const totalCards = counts.filter((c) => !c.free).reduce((sum, c) => sum + c.total, 0)

  return (
    <div
      className="md-card"
      role="button"
      tabIndex={0}
      onClick={() => openDeck(deck.id)}
      onKeyDown={(e) => e.key === 'Enter' && openDeck(deck.id)}
      title={t.myDecks.openTitle(deck.name)}
    >
      <DeckIcon card={icon} name={deck.name} size={72} />
      <div className="md-card-body">
        <div className="md-card-name" title={deck.name}>
          {deck.locked ? '🔒 ' : ''}
          {deck.name}
        </div>
        <div className="text-dim md-card-meta">
          {adapter.shortName}
          {format ? ` · ${formatLabel(deck.gameId, format)}` : ''}
        </div>
        <div className="md-card-counts">
          <Rich text={t.myDecks.cardCount(totalCards)} />
          {counts.length > 1 && <span className="text-dim"> — {counts.map((c) => `${c.label} ${c.total}`).join(' · ')}</span>}
        </div>
        <div className="md-card-foot">
          {legality ? (
            <span className={legality.legal ? 'fv-legal' : 'fv-illegal'} title={legality.issues.map((i) => i.message).join('\n') || undefined}>
              {legality.legal ? t.deckView.legal : t.deckView.issues(legality.issues.length)}
            </span>
          ) : (
            <span className="text-dim" title={t.myDecks.uncheckedTitle}>
              {t.myDecks.unchecked}
            </span>
          )}
          <PairingsBadge deckId={deck.id} />
          <span className="text-dim">{updatedLabel(deck.updatedAt)}</span>
        </div>
      </div>
      <div className="md-card-actions">
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
        <DeckLockButton deck={deck} compact />
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
        <h2>{t.myDecks.title}</h2>
        <span className="text-dim">
          {t.myDecks.deckCount(decks.length)}
          {gamesWithDecks.length > 1 ? t.myDecks.acrossGames(gamesWithDecks.length) : ''}
        </span>
      </div>

      {decks.length === 0 ? (
        <div className="text-dim">
          <Rich text={t.myDecks.none} />
        </div>
      ) : (
        <>
          <div className="col-controls">
            <input className="search-input" placeholder={t.myDecks.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} title={t.myDecks.sort}>
              <option value="recent">{t.sidebar.sortRecent}</option>
              <option value="name">{t.sidebar.sortName}</option>
              <option value="game">{t.myDecks.byGame}</option>
              <option value="custom">{t.sidebar.sortCustom}</option>
            </select>
          </div>

          {gamesWithDecks.length > 1 && (
            <div className="color-filter-row">
              <button className={`color-chip ${game === 'all' ? 'active' : ''}`} onClick={() => setGame('all')}>
                {t.myDecks.all}
              </button>
              {gamesWithDecks.map((a) => (
                <button key={a.id} className={`color-chip ${game === a.id ? 'active' : ''}`} onClick={() => setGame(a.id)}>
                  {a.shortName} ({decks.filter((d) => d.gameId === a.id).length})
                </button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="text-dim">{t.sidebar.noDecksMatch}</div>
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
