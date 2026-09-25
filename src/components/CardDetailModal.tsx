import { createPortal } from 'react-dom'
import type { Card } from '../shared/types'
import { useAppStore } from '../state/useAppStore'
import { formatPrice } from '../shared/collection'
import { rarityColorClass } from '../shared/rarityColor'
import { artUrl, artworkIds, knownArtIds } from '../shared/artChoice'
import { useState } from 'react'
import { CardImageViewer } from './CardImageViewer'
import { t } from '../shared/i18n'

export function CardDetailModal({ card: opened, onClose }: { card: Card; onClose: () => void }) {
  // Read the card from the catalog, so picking an artwork below shows up here straight away.
  const card = useAppStore((s) => s.catalogs[opened.gameId]?.byId.get(opened.id)) ?? opened
  const setArtChoice = useAppStore((s) => s.setArtChoice)
  const [enlarged, setEnlarged] = useState(false)
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
            <button className="card-detail-enlarge" onClick={() => setEnlarged(true)} title={t.cardDetail.enlargeTitle}>
              <img
                src={card.imageUrl}
                alt={card.name}
                width={card.orientation === 'landscape' ? 700 : 500}
                height={card.orientation === 'landscape' ? 500 : 700}
              />
              <span className="card-detail-enlarge-hint">{t.cardDetail.enlarge}</span>
            </button>
          ) : (
            <div className="card-tile-placeholder">{card.name}</div>
          )}
          {arts.length > 1 ? (
            <div className="card-detail-alt-arts">
              <div className="text-dim" title={t.cardDetail.artPickTitle}>
                {knownArtIds(card)
                  ? t.cardDetail.artworksPrinted(`${card.setCode}-${card.number}${card.rarity ? ` (${card.rarity})` : ''}`)
                  : t.cardDetail.artworkFor(`${card.setCode}-${card.number}${card.rarity ? ` · ${card.rarity}` : ''}`)}
              </div>
              <div className="card-detail-alt-arts-row" role="group" aria-label={t.cardDetail.artwork}>
                {arts.map((id, i) => (
                  <button
                    key={id}
                    className={`art-choice ${id === shownArt ? 'active' : ''}`}
                    aria-pressed={id === shownArt}
                    title={i === 0 ? t.cardDetail.defaultArtwork : t.cardDetail.artworkN(i + 1)}
                    onClick={() => setArtChoice(card, i === 0 ? null : id)}
                  >
                    <img src={artUrl(card, id, 'small')} alt={i === 0 ? t.cardDetail.defaultArtwork : t.cardDetail.artworkN(i + 1)} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            card.altImageUrlsSmall && card.altImageUrlsSmall.length > 0 && (
              <div className="card-detail-alt-arts">
                <div className="text-dim">{t.cardDetail.otherArtworks}</div>
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
              {onWishlist ? t.cardDetail.removeWishlist : t.cardDetail.addWishlist}
            </button>
            <button className="btn" onClick={onClose}>
              {t.common.close}
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
          {card.colors.length > 0 && <div className="text-dim">{t.cardDetail.colors(card.colors.join(', '))}</div>}
          {card.colorIdentity && card.colorIdentity.join() !== card.colors.join() && (
            <div className="text-dim">{t.cardDetail.colorIdentity(card.colorIdentity.length > 0 ? card.colorIdentity.join(', ') : 'Colorless')}</div>
          )}
          {card.cost != null && <div className="text-dim">{t.cardDetail.cost(card.cost)}</div>}
          {card.flavorNames && card.flavorNames.length > 0 && (
            <div className="text-dim">{t.cardDetail.alsoPrintedAs(card.flavorNames.join(', '))}</div>
          )}
          {card.price != null && <div className="text-dim">
              {t.cardDetail.marketPrice} {formatPrice(card.price)}
            </div>}
          <div className="detail-owned">
            <span>{t.cardDetail.ownedPrinting}</span>
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
              <span>{t.cardDetail.inBinder(currentBinder.name)}</span>
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
      {enlarged && <CardImageViewer card={card} onClose={() => setEnlarged(false)} />}
    </div>,
    document.body,
  )
}
