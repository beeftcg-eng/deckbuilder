import { useEffect, useState } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { checkDeckLegality } from '../shared/legality'
import { LegalityPanel } from './LegalityPanel'
import { ExportModal } from './ExportModal'
import type { Format } from '../shared/types'

export function DeckPanel() {
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const decks = useAppStore((s) => s.decks)
  const updateDeck = useAppStore((s) => s.updateDeck)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const setFreeTextQuantity = useAppStore((s) => s.setFreeTextQuantity)
  const formats = useAppStore((s) => s.formats)
  const loadFormats = useAppStore((s) => s.loadFormats)
  const [showExport, setShowExport] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const deck = decks.find((d) => d.id === currentDeckId)
  const cardsById = useCardsById(deck?.gameId ?? 'riftbound')

  useEffect(() => {
    setNameDraft(deck?.name ?? '')
  }, [deck?.id, deck?.name])

  useEffect(() => {
    if (deck && !formats[deck.gameId]) loadFormats(deck.gameId)
  }, [deck?.gameId])

  if (!deck) {
    return (
      <div className="deck-panel empty-state">
        <p>Select or create a deck to start building.</p>
      </div>
    )
  }

  const adapter = getAdapter(deck.gameId)
  const gameFormats: Format[] = formats[deck.gameId] ?? adapter.defaultFormats
  const format = gameFormats.find((f) => f.id === deck.formatId) ?? gameFormats[0]
  const result = format ? checkDeckLegality(deck, adapter, format, cardsById) : null

  return (
    <div className="deck-panel">
      <div className="deck-panel-header">
        <input
          className="deck-name-input"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => nameDraft.trim() && updateDeck((d) => ({ ...d, name: nameDraft.trim() }))}
        />
        <select
          value={deck.formatId}
          onChange={(e) => updateDeck((d) => ({ ...d, formatId: e.target.value }))}
        >
          {gameFormats.map((f) => (
            <option key={f.id} value={f.id} title={f.description}>
              {f.label}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" onClick={() => setShowExport(true)}>
          Export
        </button>
      </div>

      {format?.description && <div className="format-description text-dim">{format.description}</div>}

      {result && <LegalityPanel result={result} />}

      <div className="deck-zones">
        {adapter.deckRules.zones.map((zone) => {
          if (zone.freeText) {
            const entries = deck.freeTextZones[zone.id] ?? []
            const total = entries.reduce((sum, e) => sum + e.quantity, 0)
            return (
              <div className="deck-zone" key={zone.id}>
                <div className="deck-zone-header">
                  {zone.label} ({total}
                  {zone.exactCount != null ? `/${zone.exactCount}` : ''})
                </div>
                <div className="rune-chips">
                  {zone.freeText.options.map((option) => {
                    const qty = entries.find((e) => e.label === option)?.quantity ?? 0
                    return (
                      <div key={option} className="rune-chip">
                        <span>{option}</span>
                        <button className="btn stepper-btn" disabled={qty <= 0} onClick={() => setFreeTextQuantity(zone.id, option, qty - 1)}>
                          −
                        </button>
                        <span className="stepper-value">{qty}</span>
                        <button className="btn stepper-btn" onClick={() => setFreeTextQuantity(zone.id, option, qty + 1)}>
                          +
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }

          const entries = deck.zones[zone.id] ?? []
          const total = entries.reduce((sum, e) => sum + e.quantity, 0)
          return (
            <div className="deck-zone" key={zone.id}>
              <div className="deck-zone-header">
                {zone.label} ({total}
                {zone.exactCount != null ? `/${zone.exactCount}` : zone.allowedCounts ? `, needs ${zone.allowedCounts.join(' or ')}` : ''})
              </div>
              {entries.length === 0 && <div className="text-dim deck-zone-empty">Empty</div>}
              <div className="deck-zone-entries">
                {entries.map((entry) => {
                  const card = cardsById.get(entry.cardId)
                  if (!card) return null
                  return (
                    <div className="deck-entry" key={entry.cardId}>
                      {card.imageUrlSmall && <img className="deck-entry-thumb" src={card.imageUrlSmall} alt="" loading="lazy" />}
                      <span className="deck-entry-name">{card.name}</span>
                      <div className="stepper">
                        <button className="btn stepper-btn" onClick={() => setCardQuantity(zone.id, card, entry.quantity - 1)}>
                          −
                        </button>
                        <span className="stepper-value">{entry.quantity}</span>
                        <button
                          className="btn stepper-btn"
                          onClick={() => setCardQuantity(zone.id, card, entry.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showExport && format && <ExportModal deck={deck} format={format} cardsById={cardsById} onClose={() => setShowExport(false)} />}
    </div>
  )
}
