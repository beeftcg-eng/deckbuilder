import { useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import type { Card } from '../shared/types'
import { CardTile } from './CardTile'

const RESULT_CAP = 120

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

  const deck = decks.find((d) => d.id === currentDeckId)
  const adapter = getAdapter(currentGameId)

  const categories = useMemo(() => {
    if (!catalog) return []
    return [...new Set(catalog.cards.map((c) => c.category))].sort()
  }, [catalog])

  const results = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return catalog.cards.filter((c) => {
      if (category !== 'all' && c.category !== category) return false
      if (q && !c.name.toLowerCase().includes(q) && !c.text?.toLowerCase().includes(q)) return false
      return true
    })
  }, [catalog, query, category])

  if (!catalog || catalog.cards.length === 0) {
    return (
      <div className="card-browser empty-state">
        <p>No card data cached for {adapter.shortName} yet.</p>
        <p className="text-dim">Use "Sync card data" in the sidebar to download the card catalog.</p>
      </div>
    )
  }

  return (
    <div className="card-browser">
      <div className="card-browser-controls">
        <input
          className="search-input"
          placeholder={`Search ${adapter.shortName} cards…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="all">All types</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="card-browser-count text-dim">
        {results.length} match{results.length === 1 ? '' : 'es'}
        {results.length > RESULT_CAP ? ` — showing first ${RESULT_CAP}, refine your search` : ''}
      </div>

      <div className="card-grid">
        {results.slice(0, RESULT_CAP).map((card) => {
          const zone = primaryZoneFor(card, currentGameId)
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
            />
          )
        })}
      </div>
    </div>
  )
}
