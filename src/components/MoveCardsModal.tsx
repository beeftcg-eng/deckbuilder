import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { deckMoveProblem, type MoveEnd } from '../shared/cardMoves'
import { getAdapter } from '../shared/games/registry'
import type { Card } from '../shared/types'
import { t } from '../shared/i18n'

interface Props {
  /** Where the copies come from: a binder, or one zone of a deck. */
  from: MoveEnd
  card: Card
  /** Copies there: the most you can move. */
  available: number
  onClose: () => void
}

/** Move copies of one card to another binder or deck (same game), from a binder or from a deck. */
export function MoveCardsModal({ from, card, available, onClose }: Props) {
  const binders = useAppStore((s) => s.binders)
  const decks = useAppStore((s) => s.decks)
  const moveCards = useAppStore((s) => s.moveCards)
  const targetBinders = binders.filter((b) => !(from.kind === 'binder' && b.id === from.id))
  const targetDecks = decks
    .filter((d) => d.gameId === card.gameId && !(from.kind === 'deck' && d.id === from.id))
    .sort((a, b) => a.name.localeCompare(b.name))

  const [target, setTarget] = useState(
    targetBinders[0] ? `binder:${targetBinders[0].id}` : targetDecks[0] ? `deck:${targetDecks[0].id}` : '',
  )
  const [quantity, setQuantity] = useState(available)
  const [busy, setBusy] = useState(false)
  const [kind, id] = target.split(':') as ['binder' | 'deck' | '', string]
  const deck = kind === 'deck' ? targetDecks.find((d) => d.id === id) : undefined
  const problem = deck ? deckMoveProblem(deck, card) : null
  const n = Math.max(1, Math.min(available, Math.floor(quantity) || 1))
  const fromName = from.kind === 'binder' ? t.moveCards.thisBinder : t.moveCards.thisDeck

  async function move() {
    if (!kind) return
    setBusy(true)
    const moved = await moveCards(from, { kind, id }, card, n)
    setBusy(false)
    if (moved) onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal move-cards-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.moveCards.title(card.name)}>
        <div className="modal-header">
          <span>{t.moveCards.title(card.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
        {!target ? (
          <div className="text-dim">{t.moveCards.nowhere(getAdapter(card.gameId).shortName)}</div>
        ) : (
          <div className="move-cards-form">
            <label>
              <span className="text-dim">{t.moveCards.to}</span>
              <select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                {targetBinders.length > 0 && (
                  <optgroup label={t.moveCards.binders}>
                    {targetBinders.map((b) => (
                      <option key={b.id} value={`binder:${b.id}`}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {targetDecks.length > 0 && (
                  <optgroup label={t.moveCards.decks}>
                    {targetDecks.map((d) => (
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
              <span className="text-dim">{t.moveCards.copiesOf(available)}</span>
              <input id="move-quantity" type="number" min={1} max={available} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </label>
            <div className="text-dim">{kind === 'deck' ? t.moveCards.explainDeck(fromName) : t.moveCards.explainBinder(fromName)}</div>
            {problem && <div className="sync-error">{problem}</div>}
            <div className="wishlist-actions">
              <button className="btn btn-primary" onClick={move} disabled={busy || !!problem}>
                {t.moveCards.move(n)}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
