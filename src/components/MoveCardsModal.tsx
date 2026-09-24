import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { deckMoveProblem } from '../shared/cardMoves'
import { getAdapter } from '../shared/games/registry'
import type { Card } from '../shared/types'

interface Props {
  binderId: string
  card: Card
  /** Copies of the card in the binder: the most you can move. */
  available: number
  onClose: () => void
}

/** Move copies of one card out of a binder, into another binder or into a deck of the same game. */
export function MoveCardsModal({ binderId, card, available, onClose }: Props) {
  const binders = useAppStore((s) => s.binders)
  const decks = useAppStore((s) => s.decks)
  const moveBinderCards = useAppStore((s) => s.moveBinderCards)
  const moveBinderCardsToDeck = useAppStore((s) => s.moveBinderCardsToDeck)
  const otherBinders = binders.filter((b) => b.id !== binderId)
  const gameDecks = decks.filter((d) => d.gameId === card.gameId).sort((a, b) => a.name.localeCompare(b.name))

  const [target, setTarget] = useState(otherBinders[0] ? `binder:${otherBinders[0].id}` : gameDecks[0] ? `deck:${gameDecks[0].id}` : '')
  const [quantity, setQuantity] = useState(available)
  const [busy, setBusy] = useState(false)
  const [kind, id] = target.split(':') as ['binder' | 'deck' | '', string]
  const deck = kind === 'deck' ? gameDecks.find((d) => d.id === id) : undefined
  const problem = deck ? deckMoveProblem(deck, card) : null
  const n = Math.max(1, Math.min(available, Math.floor(quantity) || 1))

  async function move() {
    setBusy(true)
    if (kind === 'binder') await moveBinderCards(binderId, id, card.id, n)
    else if (kind === 'deck' && !(await moveBinderCardsToDeck(binderId, id, card, n))) {
      setBusy(false)
      return
    }
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal move-cards-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Move ${card.name}`}>
        <div className="modal-header">
          <span>Move {card.name}</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!target ? (
          <div className="text-dim">There's nowhere to move it yet: make another binder, or a {getAdapter(card.gameId).shortName} deck.</div>
        ) : (
          <div className="move-cards-form">
            <label>
              <span className="text-dim">To</span>
              <select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                {otherBinders.length > 0 && (
                  <optgroup label="Binders">
                    {otherBinders.map((b) => (
                      <option key={b.id} value={`binder:${b.id}`}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {gameDecks.length > 0 && (
                  <optgroup label="Decks">
                    {gameDecks.map((d) => (
                      <option key={d.id} value={`deck:${d.id}`}>
                        {d.locked ? '🔒 ' : ''}
                        {d.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label>
              <span className="text-dim">Copies (of {available})</span>
              <input id="move-quantity" type="number" min={1} max={available} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </label>
            <div className="text-dim">
              {kind === 'deck'
                ? 'The copies leave this binder and go into the deck. Your collection stays the same.'
                : 'The copies leave this binder and go into the other one.'}
            </div>
            {problem && <div className="sync-error">{problem}</div>}
            <div className="wishlist-actions">
              <button className="btn btn-primary" onClick={move} disabled={busy || !!problem}>
                Move {n}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
