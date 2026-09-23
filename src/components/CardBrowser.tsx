import { useMemo, useState } from 'react'
import { useAppStore, useCardsById, useOwnedIndex } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { isCardLegalInFormat } from '../shared/legality'
import { poolKey } from '../shared/collection'
import { currentDeckFor } from '../shared/decks'
import { rulesForFormat } from '../shared/games/rules'
import { identityColors } from '../shared/cardColors'
import { matchRank } from '../shared/cardSearch'
import type { Card, DeckRules } from '../shared/types'
import { CardTile } from './CardTile'
import { CardDetailModal } from './CardDetailModal'

const PAGE_SIZE = 60

// Where a plain click puts a card: the first zone that takes it, skipping ones that are only filled deliberately (sideboard, commander).
function primaryZoneFor(card: Card, rules: DeckRules) {
  return rules.zones.find((z) => !z.freeText && !z.manualOnly && z.match(card))
}

export function CardBrowser() {
  const currentGameId = useAppStore((s) => s.currentGameId)
  const catalog = useAppStore((s) => s.catalogs[currentGameId])
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const decks = useAppStore((s) => s.decks)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const formats = useAppStore((s) => s.formats)
  const collection = useAppStore((s) => s.collection)
  const changeOwned = useAppStore((s) => s.changeOwned)
  const ownedIndex = useOwnedIndex()
  const cachedCount = useAppStore((s) => s.syncMeta[currentGameId]?.count ?? 0)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [setId, setSetId] = useState<string>('all')
  const [rarity, setRarity] = useState<string>('all')
  const [colors, setColors] = useState<Set<string>>(new Set())
  const [ownedOnly, setOwnedOnly] = useState(false)
  const [showAllDuringStage, setShowAllDuringStage] = useState(false)
  const [detailCard, setDetailCard] = useState<Card | null>(null)

  const deck = currentDeckFor(decks, currentDeckId, currentGameId)
  const adapter = getAdapter(currentGameId)
  const cardsById = useCardsById(currentGameId)
  const stage = deck ? (adapter.getGuidedStage?.(deck, cardsById) ?? null) : null
  // A stage may let you switch its filter off (Magic's "Commanders only") to browse everything.
  const stageFilter = stage?.filter && !(stage.filterLabel && showAllDuringStage) ? stage.filter : undefined

  const gameFormats = deck ? (formats[deck.gameId] ?? adapter.defaultFormats) : []
  const format = deck ? (gameFormats.find((f) => f.id === deck.formatId) ?? gameFormats[0]) : undefined

  // The deck's shape (zones, limits) can depend on its format — Magic's Commander vs 60-card formats.
  const rules = deck ? rulesForFormat(adapter, deck.formatId) : adapter.deckRules

  const identityZoneId = rules.identityZoneId
  const identityCards = useMemo(() => {
    if (!deck || !identityZoneId) return []
    return (deck.zones[identityZoneId] ?? []).flatMap((entry) => {
      const card = cardsById.get(entry.cardId)
      return card ? [card] : []
    })
  }, [deck, identityZoneId, cardsById])
  const identityKey = identityCards.map((c) => c.id).join('|')

  // When the deck's Leader/Legend/Commander changes, snap the color filter to its colors. Done
  // during render (React's "adjust state when a prop changes" pattern) rather than in
  // an effect, so the filter is right on the same paint instead of one frame late.
  const [lastIdentityKey, setLastIdentityKey] = useState('')

  // The filters belong to the game being browsed. This component stays mounted when you switch game tabs, and a
  // Riftbound deck's colours left on the filter meant Magic showed only colourless cards and Pokémon nothing at all.
  const [filterGameId, setFilterGameId] = useState(currentGameId)
  if (filterGameId !== currentGameId) {
    setFilterGameId(currentGameId)
    setQuery('')
    setCategory('all')
    setSetId('all')
    setRarity('all')
    setOwnedOnly(false)
    setShowAllDuringStage(false)
    setColors(new Set())
    setLastIdentityKey('')
  }
  if (rules.colorLocked && identityKey !== lastIdentityKey) {
    setLastIdentityKey(identityKey)
    setColors(new Set(identityCards.flatMap(identityColors)))
  }

  const categories = useMemo(() => {
    if (!catalog) return []
    const excluded = new Set(adapter.mainDeckExcludedCategories ?? [])
    return [...new Set(catalog.cards.map((c) => c.category))].filter((c) => !excluded.has(c)).sort()
  }, [catalog, adapter])

  const sets = useMemo(() => {
    if (!catalog) return []
    const map = new Map<string, string>()
    for (const c of catalog.cards) {
      if (format && !isCardLegalInFormat(c, format).legal) continue
      map.set(c.setId, c.setName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [catalog, format])

  const rarities = useMemo(() => {
    if (!catalog) return []
    return [...new Set(catalog.cards.flatMap((c) => (c.rarity ? [c.rarity] : [])))].sort()
  }, [catalog])

  const allColors = useMemo(() => {
    if (!catalog) return []
    const order = adapter.colorOrder ?? []
    const rank = (color: string) => (order.includes(color) ? order.indexOf(color) : order.length)
    return [...new Set(catalog.cards.flatMap(identityColors))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }, [catalog, adapter])

  const results = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    const filtered = catalog.cards.filter((c) => {
      if (format && !isCardLegalInFormat(c, format).legal) return false
      if (stageFilter && !stageFilter(c)) return false
      if (!stageFilter) {
        if (category !== 'all') {
          if (c.category !== category) return false
        } else if (adapter.mainDeckExcludedCategories?.includes(c.category)) {
          return false
        }
      }
      if (setId !== 'all' && c.setId !== setId) return false
      if (rarity !== 'all' && c.rarity !== rarity) return false
      if (colors.size > 0) {
        const cardColors = identityColors(c)
        let matches: boolean
        if (adapter.identityColorFilter) {
          // Colorless cards fit any deck; a color-locked deck can only use cards entirely inside its colors.
          matches = cardColors.length === 0 || (rules.colorLocked ? cardColors.every((col) => colors.has(col)) : cardColors.some((col) => colors.has(col)))
        } else {
          matches = cardColors.some((col) => colors.has(col))
        }
        if (!matches) return false
      }
      if (ownedOnly && !ownedIndex.get(poolKey(c))) return false
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.text?.toLowerCase().includes(q) &&
        !c.subtypes.some((s) => s.toLowerCase().includes(q)) &&
        !c.flavorNames?.some((n) => n.toLowerCase().includes(q)) &&
        !c.sourceId.toLowerCase().includes(q) &&
        !c.setCode.toLowerCase().includes(q) &&
        !c.number.toLowerCase().includes(q)
      )
        return false
      return true
    })
    if (!q) return filtered
    return filtered.slice().sort((a, b) => matchRank(a, q) - matchRank(b, q) || a.name.localeCompare(b.name))
  }, [catalog, query, category, setId, rarity, colors, stageFilter, adapter, rules, format, ownedOnly, ownedIndex])

  // "Show more" only applies to the filters it was clicked under; any filter change starts back at one page.
  const filterKey = [query, category, setId, rarity, [...colors].sort().join(','), ownedOnly, currentGameId, stage?.label ?? '', stageFilter ? 1 : 0].join('|')
  const [page, setPage] = useState({ key: filterKey, count: PAGE_SIZE })
  const visibleCount = page.key === filterKey ? page.count : PAGE_SIZE

  function toggleColor(color: string) {
    setColors((prev) => {
      const next = new Set(prev)
      if (next.has(color)) next.delete(color)
      else next.add(color)
      return next
    })
  }

  if (!catalog && cachedCount > 0) {
    // The card data is on disk and on its way (a big game like Magic takes a moment) — it isn't missing.
    return (
      <div className="card-browser empty-state">
        <p>Loading {adapter.shortName} card data…</p>
      </div>
    )
  }

  if (!catalog || catalog.cards.length === 0) {
    return (
      <div className="card-browser empty-state">
        <p>No card data cached for {adapter.shortName} yet.</p>
        <p className="text-dim">Use "Sync card data" in the sidebar to download the card catalog.</p>
      </div>
    )
  }

  const visible = results.slice(0, visibleCount)

  return (
    <div className="card-browser">
      <div className="card-browser-controls">
        <input
          className="search-input"
          placeholder={`Search ${adapter.shortName} cards…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!stageFilter && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All types</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <label className="owned-only" title={Object.keys(collection).length === 0 ? 'Mark cards as owned to use this' : 'Only cards you own (any printing)'}>
          <input type="checkbox" checked={ownedOnly} disabled={Object.keys(collection).length === 0} onChange={(e) => setOwnedOnly(e.target.checked)} />
          Owned
        </label>
        <select value={setId} onChange={(e) => setSetId(e.target.value)}>
          <option value="all">All sets</option>
          {sets.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {rarities.length > 0 && (
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="all">All rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>

      {deck?.locked && (
        <div className="lock-banner">🔒 “{deck.name}” is locked, so cards can’t be added. Unlock it from the deck panel to keep building.</div>
      )}

      {stage && !deck?.locked && (
        <div className="stage-banner">
          <span>{stage.label}</span>
          {stage.filterLabel && (
            <label className="stage-toggle">
              <input type="checkbox" checked={!showAllDuringStage} onChange={(e) => setShowAllDuringStage(!e.target.checked)} />
              {stage.filterLabel}
            </label>
          )}
        </div>
      )}

      {allColors.length > 0 && (
        <div className="color-filter-row">
          {allColors.map((color) => (
            <button
              key={color}
              className={`color-chip ${colors.has(color) ? 'active' : ''}`}
              onClick={() => toggleColor(color)}
            >
              {color}
            </button>
          ))}
          {colors.size > 0 && (
            <button className="color-chip clear" onClick={() => setColors(new Set())}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="card-browser-count text-dim">
        {results.length} match{results.length === 1 ? '' : 'es'}
      </div>

      <div className="card-grid">
        {visible.map((card) => {
          // A guided stage's targetZoneId is a *default* for whatever the
          // stage is generally about (e.g. "Fill your Sideboard"), not a
          // dump zone for every card shown alongside it — a card that
          // doesn't actually belong in that zone (e.g. a Battlefield showing
          // up during the sideboard stage) still goes to wherever it
          // naturally matches instead of being miscategorized.
          const targetZone = stage?.targetZoneId ? rules.zones.find((z) => z.id === stage.targetZoneId) : undefined
          const zone = targetZone && targetZone.match(card) ? targetZone : primaryZoneFor(card, rules)
          const quantity = deck && zone ? (deck.zones[zone.id] ?? []).find((e) => e.cardId === card.id)?.quantity ?? 0 : 0
          const maxQuantity = zone?.maxCopiesPerCard ?? adapter.copyLimitFor?.(card) ?? rules.defaultMaxCopiesPerCard
          return (
            <CardTile
              key={card.id}
              card={card}
              quantity={quantity}
              maxQuantity={maxQuantity}
              owned={collection[card.id] ?? 0}
              ownedTotal={ownedIndex.get(poolKey(card)) ?? 0}
              onOwnedChange={(delta) => changeOwned(card.id, delta)}
              disabled={!deck || !zone || deck.locked}
              onChange={(q) => zone && setCardQuantity(zone.id, card, q)}
              onOpenDetail={() => setDetailCard(card)}
            />
          )
        })}
      </div>

      {visibleCount < results.length && (
        <button className="btn load-more-btn" onClick={() => setPage({ key: filterKey, count: visibleCount + PAGE_SIZE })}>
          Show {Math.min(PAGE_SIZE, results.length - visibleCount)} more ({visibleCount}/{results.length})
        </button>
      )}

      {detailCard && <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
    </div>
  )
}
