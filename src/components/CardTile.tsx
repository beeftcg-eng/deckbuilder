import type { Card } from '../shared/types'

interface Props {
  card: Card
  quantity: number
  maxQuantity: number
  disabled?: boolean
  onChange: (quantity: number) => void
}

export function CardTile({ card, quantity, maxQuantity, disabled, onChange }: Props) {
  return (
    <div className={`card-tile ${quantity > 0 ? 'in-deck' : ''}`}>
      <div className="card-tile-image">
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} loading="lazy" />
        ) : (
          <div className="card-tile-placeholder">{card.name}</div>
        )}
        {quantity > 0 && <div className="card-tile-badge">{quantity}</div>}
      </div>
      <div className="card-tile-info">
        <div className="card-tile-name" title={card.name}>
          {card.name}
        </div>
        <div className="card-tile-meta text-dim">
          {card.setCode} · {card.number}
        </div>
      </div>
      <div className="card-tile-controls">
        <button className="btn stepper-btn" disabled={disabled || quantity <= 0} onClick={() => onChange(Math.max(0, quantity - 1))}>
          −
        </button>
        <span className="stepper-value">{quantity}</span>
        <button
          className="btn stepper-btn"
          disabled={disabled || quantity >= maxQuantity}
          onClick={() => onChange(Math.min(maxQuantity, quantity + 1))}
        >
          +
        </button>
      </div>
    </div>
  )
}
