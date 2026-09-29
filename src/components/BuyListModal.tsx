import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ownedIndexOf, useAppStore } from '../state/useAppStore'
import { formatPrice } from '../shared/collection'
import { buyList, massEntryText, MASS_ENTRY_URL, withCheapestPrintings, type BuyMode } from '../shared/buyList'
import { isCardLegalInFormat } from '../shared/legality'
import { getAdapter } from '../shared/games/registry'
import type { Card, Deck } from '../shared/types'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

/** What's still to buy for a deck, and the list to paste into TCGplayer (shared/buyList.ts). */
/** `editable`: the deck is yours and open, so it can be switched to its cheapest printings. */
export function BuyListModal({ deck, cardsById, onClose, editable = false }: { deck: Deck; cardsById: Map<string, Card>; onClose: () => void; editable?: boolean }) {
  const collection = useAppStore((s) => s.collection)
  const catalogs = useAppStore((s) => s.catalogs)
  const wishlistCards = useAppStore((s) => s.wishlistCards)
  const cards = catalogs[deck.gameId]?.cards
  const [mode, setMode] = useState<BuyMode>('cheapest')
  const [message, setMessage] = useState<string | null>(null)

  const owned = useMemo(() => ownedIndexOf(collection, catalogs), [collection, catalogs])
  const list = useMemo(() => buyList(deck, cardsById, cards ?? [...cardsById.values()], owned, mode), [deck, cardsById, cards, owned, mode])
  const copies = list.rows.reduce((n, r) => n + r.quantity, 0)
  const saved = list.deckPrintingsTotal - list.total
  const formats = useAppStore((s) => s.formats[deck.gameId])
  const format = (formats ?? getAdapter(deck.gameId).defaultFormats).find((f) => f.id === deck.formatId)
  const cheaper = useMemo(
    () =>
      editable && cards
        ? withCheapestPrintings(deck, cardsById, cards, (id) => collection[id] ?? 0, format ? (c) => isCardLegalInFormat(c, format).legal : undefined)
        : null,
    [editable, deck, cardsById, cards, collection, format],
  )

  async function switchPrintings() {
    if (!cheaper || cheaper.changedCopies === 0) return
    const { currentDeckId, updateDeck } = useAppStore.getState()
    if (currentDeckId !== deck.id) return
    await updateDeck(() => cheaper.deck, t.buyList.switchUndo)
    setMessage(t.buyList.switched(cheaper.changedCopies, formatPrice(cheaper.before - cheaper.after)))
  }

  async function copyMassEntry() {
    await window.api.clipboard.writeText(massEntryText(list.rows))
    setMessage(t.buyList.copied)
  }

  async function addToWishlist() {
    const n = await wishlistCards(list.rows.map((r) => r.card))
    setMessage(t.buyList.wishlisted(n))
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal buy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.buyList.title(deck.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>

        {list.rows.length === 0 ? (
          <div>{t.buyList.complete}</div>
        ) : (
          <>
            <div className="fv-modes" role="tablist">
              {(['cheapest', 'deck'] as const).map((m) => (
                <button key={m} className={mode === m ? 'btn btn-primary' : 'btn'} aria-pressed={mode === m} onClick={() => setMode(m)}>
                  {m === 'cheapest' ? t.buyList.cheapest : t.buyList.deckPrintings}
                </button>
              ))}
            </div>
            <div className="import-summary">
              <Rich text={t.buyList.summary(copies, formatPrice(list.total))} />
              {list.unpricedCopies > 0 && <span className="text-dim">{t.buyList.unpriced(list.unpricedCopies)}</span>}
              {mode === 'cheapest' && saved >= 0.5 && <div className="text-dim">{t.buyList.saves(formatPrice(saved))}</div>}
            </div>
            <div className="buy-rows">
              {list.rows.map(({ card, deckCard, quantity, unitPrice }) => (
                <div key={card.id} className="buy-row">
                  {card.imageUrlSmall ? <img className="deck-entry-thumb" src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="deck-entry-thumb" />}
                  <span className="buy-qty">{quantity}×</span>
                  <span className="buy-name">
                    {card.name}
                    <span className="text-dim">
                      {' '}
                      {card.setCode} · {card.number}
                      {card.id !== deckCard.id ? ` · ${t.buyList.instead(`${deckCard.setCode} ${deckCard.number}`)}` : ''}
                    </span>
                  </span>
                  <span className="buy-price">{unitPrice != null ? formatPrice(unitPrice * quantity) : '—'}</span>
                </div>
              ))}
            </div>
            <div className="import-fields buy-actions">
              <button className="btn btn-primary" onClick={() => void copyMassEntry()}>
                {t.buyList.copyMassEntry}
              </button>
              <button className="btn" onClick={() => void window.api.system.openExternal(MASS_ENTRY_URL)}>
                {t.buyList.openTcgplayer}
              </button>
              <button className="btn" onClick={() => void addToWishlist()}>
                {t.buyList.wishlist}
              </button>
            </div>
            {cheaper && cheaper.changedCopies > 0 && cheaper.before - cheaper.after >= 0.5 && (
              <button className="btn" title={t.buyList.switchTitle} onClick={() => void switchPrintings()}>
                {t.buyList.switchButton(formatPrice(cheaper.before - cheaper.after))}
              </button>
            )}
            {message && <div className="text-dim">{message}</div>}
            <div className="text-dim proxy-note">{t.buyList.note}</div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
