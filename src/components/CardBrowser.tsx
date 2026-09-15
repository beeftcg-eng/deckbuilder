import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import type { Card } from '../shared/types'
import { CardTile } from './CardTile'
import { CardDetailModal } from './CardDetailModal'

const PAGE_SIZE = 60

function primaryZoneFor(card: Card, gameId: Card['gameId']) {
  const adapter = getAdapter(gameId)
  return adapter.deckRules.zones.find((z) => !z.freeText && z.match(card))
}

export function CardBrowser() {
  const currentGameId = useAppStore((s) => s.currentGameId)
  const catalog = useAppStore((s) => s.catalogs[currentGameId])
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const decks = useAppStore((s) => s.decks)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [setId, setSetId] = useState<string>('all')
  const [colors, setColors] = useState<Set<string>>(new Set())
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [detailCard, setDetailCard] = useState<Card | null>(null)

  const deferredQuery = useDeferredValue(query)
  const deferredCategory = useDeferredValue(category)
  const deferredSetId = useDeferredValue(setId)
  const deferredColors = useDeferredValue(colors)

  const deck = decks.find((d) => d.id === currentDeckId)
  const adapter = getAdapter(currentGameId)
  const cardsById = useCardsById(currentGameId)
  const stage = deck ? (adapter.getGuidedStage?.(deck, cardsById) ?? null) : null

  const categories = useMemo(() => {
    if (!catalog) return []
    return [...new Set(catalog.cards.map((c) => c.category))].sort()
  }, [catalog])

  const sets = useMemo(() => {
    if (!catalog) return []
    const map = new Map<string, string>()
    for (const c of catalog.cards) map.set(c.setId, c.setName)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [catalog])

  const allColors = useMemo(() => {
    if (!catalog) return []
    return [...new Set(catalog.cards.flatMap((c) => c.colors))].sort()
  }, [catalog])

  const results = useMemo(() => {
    if (!catalog) return []
    const q = deferredQuery.trim().toLowerCase()
    return catalog.cards.filter((c) => {
      if (stage?.filter && !stage.filter(c)) return false
      if (!stage?.filter) {
        if (deferredCategory !== 'all') {
          if (c.category !== deferredCategory) return false
        } else if (adapter.mainDeckExcludedCategories?.includes(c.category)) {
          return false
        }
      }
      if (deferredSetId !== 'all' && c.setId !== deferredSetId) return false
      if (deferredColors.size > 0 && !c.colors.some((col) => deferredColors.has(col))) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.text?.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalog, deferredQuery, deferredCategory, deferredSetId, deferredColors, stage, adapter])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [deferredQuery, deferredCategory, deferredSetId, deferredColors, currentGameId, stage?.label])

  function toggleColor(color: string) {
    setColors((prev) => {
      const next = new Set(prev)
      if (next.has(color)) next.delete(color)
      else next.add(color)
      return next
    })
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
        {!stage?.filter && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All types</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select value={setId} onChange={(e) => setSetId(e.target.value)}>
          <option value="all">All sets</option>
          {sets.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {stage && <div className="stage-banner">{stage.label}</div>}

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
          const zone = stage?.targetZoneId
            ? adapter.deckRules.zones.find((z) => z.id === stage.targetZoneId)
            : primaryZoneFor(card, currentGameId)
          const quantity = deck && zone ? (deck.zones[zone.id] ?? []).find((e) => e.cardId === card.id)?.quantity ?? 0 : 0
          const maxQuantity = zone?.maxCopiesPerCard ?? adapter.deckRules.defaultMaxCopiesPerCard
          return (
            <CardTile
              key={card.id}
              card={card}
              quantity={quantity}
              maxQuantity={maxQuantity}
              disabled={!deck || !zone}
              onChange={(q) => zone && setCardQuantity(zone.id, card, q)}
              onOpenDetail={() => setDetailCard(card)}
            />
          )
        })}
      </div>

      {visibleCount < results.length && (
        <button className="btn load-more-btn" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, results.length - visibleCount)} more ({visibleCount}/{results.length})
        </button>
      )}

      {detailCard && <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
    </div>
  )
}
