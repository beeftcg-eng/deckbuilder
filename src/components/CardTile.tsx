import type { Card } from '../shared/types'
import { useAppStore } from '../state/useAppStore'
import { formatPrice } from '../shared/collection'
import { rarityColorClass } from '../shared/rarityColor'
import { artworkIds } from '../shared/artChoice'
import { t } from '../shared/i18n'

interface Props {
  card: Card
  quantity: number
  maxQuantity: number
  /** Copies of this exact printing you own. */
  owned: number
  /** Copies you own across every printing of this card (what a deck slot can use). */
  ownedTotal: number
  /** Called with +1 or −1; relative so rapid clicks can't overwrite one another. */
  onOwnedChange: (delta: number) => void
  disabled?: boolean
  onChange: (quantity: number) => void
  onOpenDetail: () => void
}

export function CardTile({ card, quantity, maxQuantity, owned, ownedTotal, onOwnedChange, disabled, onChange, onOpenDetail }: Props) {
  const addToWishlist = useAppStore((s) => s.addToWishlist)
  const removeFromWishlist = useAppStore((s) => s.removeFromWishlist)
  const wishlistEntryId = useAppStore((s) => s.wishlist.find((e) => e.cardId === card.id)?.id)
  const onWishlist = wishlistEntryId != null
  const currentBinderId = useAppStore((s) => s.currentBinderId)
  const currentBinder = useAppStore((s) => s.binders.find((b) => b.id === currentBinderId))
  const setBinderCardQuantity = useAppStore((s) => s.setBinderCardQuantity)
  const inBinder = currentBinder?.cards[card.id] ?? 0
  // Yu-Gi-Oh cards with several official artworks: the data can't say which printing has which, so
  // a badge points at the picker in the card details (it's easy to miss otherwise).
  const artCount = card.gameId === 'yugioh' ? artworkIds(card).length : 0

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
        {artCount > 1 && (
          <button
            className="card-tile-arts"
            title={t.cardTile.artsTitle(artCount)}
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail()
            }}
          >
            {t.cardTile.arts(artCount)}
          </button>
        )}
        <button
          className={`wishlist-toggle ${onWishlist ? 'active' : ''}`}
          title={onWishlist ? t.cardTile.removeWishlist : t.cardTile.addWishlist}
          onClick={(e) => {
            e.stopPropagation()
            if (wishlistEntryId != null) removeFromWishlist(wishlistEntryId)
            else addToWishlist(card, 1)
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
          {card.rarity ? (
            <>
              {' · '}
              <span className={rarityColorClass(card.rarity)}>{card.rarity}</span>
            </>
          ) : (
            ''
          )}
          {card.price != null ? ` · ${formatPrice(card.price)}` : ''}
        </div>
        {card.flavorNames && card.flavorNames.length > 0 && (
          <div className="card-tile-meta text-dim" title={t.cardTile.alsoPrintedAs(card.flavorNames.join(', '))}>
            {t.cardTile.aka(card.flavorNames.join(', '))}
          </div>
        )}
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
      <div
        className="card-tile-owned"
        title={ownedTotal > owned ? t.cardTile.ownedTitle(owned, ownedTotal) : t.cardTile.ownedTitleSimple}
      >
        <span className="text-dim">{t.cardTile.own}</span>
        <button className="btn stepper-btn stepper-mini" disabled={owned <= 0} onClick={() => onOwnedChange(-1)}>
          −
        </button>
        <span className="stepper-value">{owned}</span>
        <button className="btn stepper-btn stepper-mini" onClick={() => onOwnedChange(1)}>
          +
        </button>
        {ownedTotal > owned && <span className="text-dim">{t.cardTile.ownedTotal(ownedTotal)}</span>}
      </div>
      {currentBinder && (
        <div className="card-tile-owned" title={t.cardTile.inBinderTitle(currentBinder.name)}>
          <span className="text-dim">{currentBinder.name}</span>
          <button className="btn stepper-btn stepper-mini" disabled={inBinder <= 0} onClick={() => setBinderCardQuantity(currentBinder.id, card.id, inBinder - 1)}>
            −
          </button>
          <span className="stepper-value">{inBinder}</span>
          <button className="btn stepper-btn stepper-mini" onClick={() => setBinderCardQuantity(currentBinder.id, card.id, inBinder + 1)}>
            +
          </button>
        </div>
      )}
    </div>
  )
}
