import { createPortal } from 'react-dom'
import type { Card } from '../shared/types'
import { useAppStore } from '../state/useAppStore'
import { formatPrice } from '../shared/collection'
import { rarityColorClass } from '../shared/rarityColor'
import { artUrl, artworkIds, knownArtIds } from '../shared/artChoice'

export function CardDetailModal({ card: opened, onClose }: { card: Card; onClose: () => void }) {
  // Read the card from the catalog, so picking an artwork below shows up here straight away.
  const card = useAppStore((s) => s.catalogs[opened.gameId]?.byId.get(opened.id)) ?? opened
  const setArtChoice = useAppStore((s) => s.setArtChoice)
  const arts = card.gameId === 'yugioh' ? artworkIds(card) : []
  const shownArt = arts.find((id) => card.imageUrl === artUrl(card, id, 'full'))
  const addToWishlist = useAppStore((s) => s.addToWishlist)
  const removeFromWishlist = useAppStore((s) => s.removeFromWishlist)
  const wishlistEntryId = useAppStore((s) => s.wishlist.find((e) => e.cardId === card.id)?.id)
  const onWishlist = wishlistEntryId != null
  const owned = useAppStore((s) => s.collection[card.id] ?? 0)
  const changeOwned = useAppStore((s) => s.changeOwned)
  const currentBinderId = useAppStore((s) => s.currentBinderId)
  const currentBinder = useAppStore((s) => s.binders.find((b) => b.id === currentBinderId))
  const setBinderCardQuantity = useAppStore((s) => s.setBinderCardQuantity)
  const inBinder = currentBinder?.cards[card.id] ?? 0

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-detail-image">
          {card.imageUrl ? (
            <img
              src={card.imageUrl}
              alt={card.name}
              width={card.orientation === 'landscape' ? 700 : 500}
              height={card.orientation === 'landscape' ? 500 : 700}
            />
          ) : (
            <div className="card-tile-placeholder">{card.name}</div>
          )}
          {arts.length > 1 ? (
            <div className="card-detail-alt-arts">
              <div className="text-dim" title="The card data lists every official artwork but not which printing uses which, so pick the one your copy has. It's used for this printing everywhere in the app.">
                {knownArtIds(card)
                  ? `Artworks ${card.setCode}-${card.number}${card.rarity ? ` (${card.rarity})` : ''} was printed with — pick the one on your copy:`
                  : `Artwork for ${card.setCode}-${card.number}${card.rarity ? ` · ${card.rarity}` : ''} — pick the one on your copy:`}
              </div>
              <div className="card-detail-alt-arts-row" role="group" aria-label="Artwork">
                {arts.map((id, i) => (
                  <button
                    key={id}
                    className={`art-choice ${id === shownArt ? 'active' : ''}`}
                    aria-pressed={id === shownArt}
                    title={i === 0 ? 'Default artwork' : `Artwork ${i + 1}`}
                    onClick={() => setArtChoice(card, i === 0 ? null : id)}
                  >
                    <img src={artUrl(card, id, 'small')} alt={i === 0 ? 'Default artwork' : `Artwork ${i + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            card.altImageUrlsSmall && card.altImageUrlsSmall.length > 0 && (
              <div className="card-detail-alt-arts">
                <div className="text-dim">Other known artworks:</div>
                <div className="card-detail-alt-arts-row">
                  {card.altImageUrlsSmall.map((url) => (
                    <img key={url} src={url} alt="" loading="lazy" />
                  ))}
                </div>
              </div>
            )
          )}
        </div>
        <div className="card-detail-info">
          <div className="modal-header">
            <span>{card.name}</span>
            <button
              className="btn"
              onClick={() => (wishlistEntryId != null ? removeFromWishlist(wishlistEntryId) : addToWishlist(card, 1))}
            >
              {onWishlist ? '★ Remove from wishlist' : '☆ Add to wishlist'}
            </button>
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
          <div className="text-dim">
            {card.setName} · {card.setCode} {card.number}
            {card.rarity ? (
              <>
                {' · '}
                <span className={rarityColorClass(card.rarity)}>{card.rarity}</span>
              </>
            ) : (
              ''
            )}
          </div>
          <div className="text-dim">
            {card.category}
            {card.subtypes.length ? ` — ${card.subtypes.join(', ')}` : ''}
          </div>
          {card.colors.length > 0 && <div className="text-dim">Colors: {card.colors.join(', ')}</div>}
          {card.colorIdentity && card.colorIdentity.join() !== card.colors.join() && (
            <div className="text-dim">Color identity: {card.colorIdentity.length > 0 ? card.colorIdentity.join(', ') : 'Colorless'}</div>
          )}
          {card.cost != null && <div className="text-dim">Cost: {card.cost}</div>}
          {card.flavorNames && card.flavorNames.length > 0 && (
            <div className="text-dim">Also printed as: {card.flavorNames.join(', ')}</div>
          )}
          {card.price != null && <div className="text-dim">Market price ≈ {formatPrice(card.price)}</div>}
          <div className="detail-owned">
            <span>Owned (this printing)</span>
            <button className="btn stepper-btn" disabled={owned <= 0} onClick={() => changeOwned(card.id, -1)}>
              −
            </button>
            <span className="stepper-value">{owned}</span>
            <button className="btn stepper-btn" onClick={() => changeOwned(card.id, 1)}>
              +
            </button>
          </div>
          {currentBinder && (
            <div className="detail-owned">
              <span>In "{currentBinder.name}"</span>
              <button className="btn stepper-btn" disabled={inBinder <= 0} onClick={() => setBinderCardQuantity(currentBinder.id, card.id, inBinder - 1)}>
                −
              </button>
              <span className="stepper-value">{inBinder}</span>
              <button className="btn stepper-btn" onClick={() => setBinderCardQuantity(currentBinder.id, card.id, inBinder + 1)}>
                +
              </button>
            </div>
          )}
          {card.text && <p className="card-detail-text">{card.text}</p>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
