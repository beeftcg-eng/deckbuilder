import type { Card } from '../shared/types'
import { useAppStore } from '../state/useAppStore'

interface Props {
  card: Card
  quantity: number
  maxQuantity: number
  disabled?: boolean
  onChange: (quantity: number) => void
  onOpenDetail: () => void
}

export function CardTile({ card, quantity, maxQuantity, disabled, onChange, onOpenDetail }: Props) {
  const addToWishlist = useAppStore((s) => s.addToWishlist)
  const onWishlist = useAppStore((s) => s.wishlist.some((e) => e.cardId === card.id))

  return (
    <div className={`card-tile ${quantity > 0 ? 'in-deck' : ''}`}>
      <div className="card-tile-image" onClick={onOpenDetail} role="button" tabIndex={0}>
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            loading="lazy"
            width={card.orientation === 'landscape' ? 700 : 500}
            height={card.orientation === 'landscape' ? 500 : 700}
          />
        ) : (
          <div
            className="card-tile-placeholder"
            style={{ aspectRatio: card.orientation === 'landscape' ? '7 / 5' : '5 / 7' }}
          >
            {card.name}
          </div>
        )}
        {quantity > 0 && <div className="card-tile-badge">{quantity}</div>}
        <button
          className={`wishlist-toggle ${onWishlist ? 'active' : ''}`}
          title={onWishlist ? 'On your wishlist' : 'Add to wishlist'}
          onClick={(e) => {
            e.stopPropagation()
            addToWishlist(card, 1)
          }}
        >
          {onWishlist ? '★' : '☆'}
        </button>
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
