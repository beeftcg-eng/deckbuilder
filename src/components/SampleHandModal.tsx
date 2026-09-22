import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card, Deck } from '../shared/types'
import { expandZone, shuffled } from '../shared/sampleHand'

interface Props {
  deck: Deck
  cardsById: Map<string, Card>
  handSize: number
  onClose: () => void
}

/** Shuffles the main deck and draws an opening hand; "Draw a card" keeps dealing from the same shuffle. */
export function SampleHandModal({ deck, cardsById, handSize, onClose }: Props) {
  const [library, setLibrary] = useState(() => shuffled(expandZone(deck, 'main', cardsById)))
  const [drawn, setDrawn] = useState(handSize)

  function newHand() {
    setLibrary(shuffled(expandZone(deck, 'main', cardsById)))
    setDrawn(handSize)
  }

  const hand = library.slice(0, drawn)
  const remaining = Math.max(0, library.length - drawn)

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sample-hand-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Sample hand — {deck.name}</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>

        {library.length === 0 ? (
          <div className="text-dim">The main deck is empty — add some cards first.</div>
        ) : (
          <>
            <div className="sample-hand-actions">
              <button className="btn btn-primary" onClick={newHand}>
                New hand ({handSize})
              </button>
              <button className="btn" disabled={remaining === 0} onClick={() => setDrawn((n) => n + 1)}>
                Draw a card
              </button>
              <span className="text-dim">
                {hand.length} in hand · {remaining} left in deck
              </span>
            </div>
            <div className="sample-hand-grid">
              {hand.map((card, i) => (
                <div className="sample-hand-card" key={`${card.id}-${i}`} title={card.name}>
                  {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt={card.name} /> : <div className="card-tile-placeholder">{card.name}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
