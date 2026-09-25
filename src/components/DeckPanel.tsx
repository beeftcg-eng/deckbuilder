import { MoveCardsModal } from './MoveCardsModal'
import { useMemo, useState } from 'react'
import { useAppStore, useCardsById, useOwnedIndex, wishlistIndexOf } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { checkDeckLegality } from '../shared/legality'
import { computeDeckStats } from '../shared/deckStats'
import { missingForDeck, neededByPool, poolKey, totalPrice } from '../shared/collection'
import { LegalityPanel } from './LegalityPanel'
import { ExportModal } from './ExportModal'
import { DeckStats } from './DeckStats'
import { SampleHandModal } from './SampleHandModal'
import { BanListEditor } from './BanListEditor'
import { DeckLockButton } from './DeckLockButton'
import { PairingsSyncReminder } from './PairingsSyncReminder'
import { DeckIcon } from './DeckIcon'
import { currentDeckFor } from '../shared/decks'
import { resolveDeckIcon } from '../shared/deckIcon'
import { DECK_CARD_SORT_LABELS, sortDeckCards, type DeckCardSort } from '../shared/deckEdits'
import type { Card, Deck, DeckZoneRule, Format } from '../shared/types'

/** What a zone's header says about its size, e.g. "/40", ", at least 60", ", up to 15". */
function zoneCountHint(zone: DeckZoneRule): string {
  if (zone.exactCount != null) return `/${zone.exactCount}`
  if (zone.allowedCounts) return `, needs ${zone.allowedCounts.join(' or ')}`
  if (zone.minCount != null && zone.maxCount != null) return `, ${zone.minCount}–${zone.maxCount}`
  if (zone.minCount != null) return `, at least ${zone.minCount}`
  if (zone.maxCount != null) return `, up to ${zone.maxCount}`
  return ''
}

export function DeckPanel() {
  const deck = useAppStore((s) => currentDeckFor(s.decks, s.currentDeckId, s.currentGameId))

  if (!deck) {
    return (
      <div className="deck-panel empty-state">
        <p>Select or create a deck to start building.</p>
      </div>
    )
  }
  // Keyed by deck so switching decks starts with fresh drafts and closed dialogs.
  return <DeckEditor key={deck.id} deck={deck} />
}

function DeckEditor({ deck }: { deck: Deck }) {
  const updateDeck = useAppStore((s) => s.updateDeck)
  const duplicateDeck = useAppStore((s) => s.duplicateDeck)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const setFreeTextQuantity = useAppStore((s) => s.setFreeTextQuantity)
  const moveCard = useAppStore((s) => s.moveCard)
  const reorderDeckEntries = useAppStore((s) => s.reorderDeckEntries)
  const setDeckIcon = useAppStore((s) => s.setDeckIcon)
  const setDeckViewing = useAppStore((s) => s.setDeckViewing)
  const addDeckToWishlist = useAppStore((s) => s.addDeckToWishlist)
  const wishlistMissing = useAppStore((s) => s.wishlistMissing)
  const markDeckOwned = useAppStore((s) => s.markDeckOwned)
  const formats = useAppStore((s) => s.formats[deck.gameId])
  const wishlist = useAppStore((s) => s.wishlist)
  const catalogs = useAppStore((s) => s.catalogs)
  const tracking = useAppStore((s) => Object.keys(s.collection).length > 0)
  const ownedIndex = useOwnedIndex()
  const cardsById = useCardsById(deck.gameId)

  const [showExport, setShowExport] = useState(false)
  const [markingOwned, setMarkingOwned] = useState(false)
  const [movingOut, setMovingOut] = useState<{ zoneId: string; card: Card; quantity: number } | null>(null)
  const [showSampleHand, setShowSampleHand] = useState(false)
  const [showBanList, setShowBanList] = useState(false)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dragEntry, setDragEntry] = useState<{ zoneId: string; cardId: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ zoneId: string; cardId: string; position: 'before' | 'after' } | null>(null)

  const locked = Boolean(deck.locked)
  const adapter = getAdapter(deck.gameId)
  const gameFormats: Format[] = formats ?? adapter.defaultFormats
  const format = gameFormats.find((f) => f.id === deck.formatId) ?? gameFormats[0]
  const zones = useMemo(() => rulesForFormat(adapter, deck.formatId).zones, [adapter, deck.formatId])

  const result = useMemo(() => (format ? checkDeckLegality(deck, adapter, format, cardsById) : null), [deck, adapter, format, cardsById])
  const stats = useMemo(() => computeDeckStats(deck, cardsById), [deck, cardsById])
  const iconCard = useMemo(() => resolveDeckIcon(deck, adapter, cardsById), [deck, adapter, cardsById])
  const needs = useMemo(() => neededByPool(deck, cardsById), [deck, cardsById])
  const missing = useMemo(() => missingForDeck(deck, cardsById, ownedIndex), [deck, cardsById, ownedIndex])
  const missingNotWishlisted = useMemo(
    () => missingForDeck(deck, cardsById, ownedIndex, wishlistIndexOf(wishlist, catalogs)),
    [deck, cardsById, ownedIndex, wishlist, catalogs],
  )
  const missingCopies = missing.reduce((sum, m) => sum + m.quantity, 0)
  const toWishlistCopies = missingNotWishlisted.reduce((sum, m) => sum + m.quantity, 0)

  function flash(text: string) {
    setMessage(text)
    setTimeout(() => setMessage(null), 3500)
  }

  function commitName() {
    const trimmed = nameDraft?.trim()
    setNameDraft(null)
    if (trimmed && trimmed !== deck.name) updateDeck((d) => ({ ...d, name: trimmed }), 'Rename deck')
  }

  async function handleWishlistDeck() {
    const count = await addDeckToWishlist(deck)
    flash(count > 0 ? `★ Added ${count} card${count === 1 ? '' : 's'} to your wishlist.` : 'This deck has no cards yet.')
  }

  async function handleWishlistMissing() {
    const count = await wishlistMissing(deck)
    flash(count > 0 ? `★ Wishlisted ${count} missing card${count === 1 ? '' : 's'}.` : 'Nothing to add — you own or have wishlisted everything.')
  }

  async function handleMarkOwned() {
    if (markingOwned) return
    if (missingCopies === 0) {
      flash('You already own every card in this deck.')
      return
    }
    if (!confirm(`Add the ${missingCopies} missing card${missingCopies === 1 ? '' : 's'} to your collection as owned?`)) return
    setMarkingOwned(true)
    try {
      const count = await markDeckOwned(deck)
      flash(`✓ Marked ${count} card${count === 1 ? '' : 's'} as owned.`)
    } finally {
      setMarkingOwned(false)
    }
  }

  return (
    <div className="deck-panel">
      <div className="deck-panel-header">
        <DeckIcon card={iconCard} name={deck.name} size={38} />
        <input
          className="deck-name-input"
          disabled={locked}
          value={nameDraft ?? deck.name}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <select value={deck.formatId} disabled={locked} onChange={(e) => updateDeck((d) => ({ ...d, formatId: e.target.value }), 'Change format')}>
          {gameFormats.map((f) => (
            <option key={f.id} value={f.id} title={f.description}>
              {f.label}
            </option>
          ))}
        </select>
        <DeckLockButton deck={deck} />
        <button className="btn btn-primary" onClick={() => setShowExport(true)}>
          Export
        </button>
      </div>

      {locked && <div className="lock-banner">🔒 This deck is locked, so it can’t be changed. Press “Locked” above to unlock it.</div>}
      <PairingsSyncReminder deck={deck} />

      <div className="deck-actions">
        <button className="btn" onClick={() => setDeckViewing(true)} title="See the finished deck: card images, a list, or plain text">
          ⛶ View deck
        </button>
        <button className="btn" onClick={handleWishlistDeck} title="Add every card in this deck to your wishlist">
          ☆ Wishlist deck
        </button>
        <button
          className="btn"
          onClick={handleWishlistMissing}
          disabled={toWishlistCopies === 0}
          title="Add only the cards you don't own and haven't already wishlisted"
        >
          ☆ Wishlist missing{toWishlistCopies > 0 ? ` (${toWishlistCopies})` : ''}
        </button>
        <button className="btn" onClick={handleMarkOwned} disabled={markingOwned} title="Mark every card in this deck as owned">
          {markingOwned ? 'Marking…' : '✓ I own this deck'}
        </button>
        <button className="btn" onClick={() => setShowSampleHand(true)} title="Shuffle the main deck and draw an opening hand">
          Sample hand
        </button>
        <button className="btn" onClick={() => duplicateDeck(deck.id)} title="Make an editable copy of this deck">
          Duplicate
        </button>
        <select
          value=""
          disabled={locked}
          title="Put the cards in order once (you can still drag them afterwards; Undo puts them back)"
          onChange={(e) => {
            const sort = e.target.value as DeckCardSort
            updateDeck((d) => sortDeckCards(d, sort, cardsById, adapter.typeOrder), `Sort by ${DECK_CARD_SORT_LABELS[sort].toLowerCase()}`)
          }}
        >
          <option value="" disabled>
            Sort cards…
          </option>
          {(Object.keys(DECK_CARD_SORT_LABELS) as DeckCardSort[]).map((sort) => (
            <option key={sort} value={sort}>
              {DECK_CARD_SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>

      {message && <div className="text-dim">{message}</div>}

      {format?.description && <div className="format-description text-dim">{format.description}</div>}

      {result && (
        <LegalityPanel
          result={result}
          banList={adapter.legalitySource === 'local' ? { reviewedAt: format?.reviewedAt, onEdit: () => setShowBanList(true) } : undefined}
        />
      )}

      <DeckStats stats={stats} toBuy={tracking ? totalPrice(missing) : null} gameHasPrices={adapter.hasPrices} showSubtypeStats={Boolean(adapter.showSubtypeStats)} />

      <div className="deck-zones">
        {zones.map((zone) => {
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
                        <button className="btn stepper-btn" disabled={locked || qty <= 0} onClick={() => setFreeTextQuantity(zone.id, option, qty - 1)}>
                          −
                        </button>
                        <span className="stepper-value">{qty}</span>
                        <button className="btn stepper-btn" disabled={locked} onClick={() => setFreeTextQuantity(zone.id, option, qty + 1)}>
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
                {zoneCountHint(zone)})
              </div>
              {entries.length === 0 && <div className="text-dim deck-zone-empty">Empty</div>}
              <div className="deck-zone-entries">
                {entries.map((entry) => {
                  const card = cardsById.get(entry.cardId)
                  if (!card) return null
                  const key = poolKey(card)
                  const needed = needs.get(key)?.needed ?? entry.quantity
                  const owned = ownedIndex.get(key) ?? 0
                  // Other zones this card could go to (main deck ⇄ sideboard, main deck ⇄ commander).
                  const moveTargets = zones.filter((z) => z.id !== zone.id && !z.freeText && z.match(card))
                  const dragging = dragEntry?.zoneId === zone.id && dragEntry.cardId === entry.cardId
                  const dropHere = dropTarget?.zoneId === zone.id && dropTarget.cardId === entry.cardId
                  return (
                    <div
                      className={`deck-entry ${dragging ? 'dragging' : ''} ${dropHere ? `drop-${dropTarget.position}` : ''}`}
                      key={entry.cardId}
                      draggable={!locked}
                      title={locked ? undefined : 'Drag to reorder'}
                      onDragStart={(e) => {
                        setDragEntry({ zoneId: zone.id, cardId: entry.cardId })
                        if (e.dataTransfer) {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', entry.cardId)
                        }
                      }}
                      onDragOver={(e) => {
                        if (!dragEntry || dragEntry.zoneId !== zone.id || dragEntry.cardId === entry.cardId) return
                        e.preventDefault()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                        if (!dropHere || dropTarget.position !== position) setDropTarget({ zoneId: zone.id, cardId: entry.cardId, position })
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dragEntry && dragEntry.zoneId === zone.id && dragEntry.cardId !== entry.cardId) {
                          const rect = e.currentTarget.getBoundingClientRect()
                          reorderDeckEntries(zone.id, dragEntry.cardId, entry.cardId, e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
                        }
                        setDragEntry(null)
                        setDropTarget(null)
                      }}
                      onDragEnd={() => {
                        setDragEntry(null)
                        setDropTarget(null)
                      }}
                    >
                      {card.imageUrlSmall && <img className="deck-entry-thumb" src={card.imageUrlSmall} alt="" loading="lazy" />}
                      <span className="deck-entry-name">{card.name}</span>
                      {tracking && owned < needed && (
                        <span className="deck-entry-short" title={`You own ${owned} of the ${needed} this deck uses`}>
                          own {owned}/{needed}
                        </span>
                      )}
                      <button
                        className={`btn icon-btn ${iconCard?.id === card.id ? 'icon-btn-active' : ''}`}
                        disabled={locked}
                        title={iconCard?.id === card.id && deck.iconCardId === card.id ? 'This is the deck icon (click to reset to the automatic one)' : 'Use this card as the deck icon'}
                        onClick={() => setDeckIcon(deck.iconCardId === card.id ? null : card.id)}
                      >
                        🖼
                      </button>
                      {moveTargets.map((target) => {
                        const inTarget = deck.zones[target.id]?.find((e) => e.cardId === card.id)?.quantity ?? 0
                        const full = target.maxCopiesPerCard != null && inTarget >= target.maxCopiesPerCard
                        return (
                          <button
                            key={target.id}
                            className="btn move-btn"
                            disabled={locked || full}
                            title={full ? `${target.label} already has this card` : `Move one copy to ${target.label}`}
                            onClick={() => moveCard(zone.id, target, card)}
                          >
                            → {target.label}
                          </button>
                        )
                      })}
                      <button
                        className="btn move-btn"
                        disabled={locked}
                        title={locked ? 'Unlock the deck to move cards out of it' : 'Move copies to a binder or another deck'}
                        onClick={() => setMovingOut({ zoneId: zone.id, card, quantity: entry.quantity })}
                      >
                        Move…
                      </button>
                      <div className="stepper">
                        <button className="btn stepper-btn" disabled={locked} onClick={() => setCardQuantity(zone.id, card, entry.quantity - 1)}>
                          −
                        </button>
                        <span className="stepper-value">{entry.quantity}</span>
                        <button className="btn stepper-btn" disabled={locked} onClick={() => setCardQuantity(zone.id, card, entry.quantity + 1)}>
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
      {movingOut && (
        <MoveCardsModal
          from={{ kind: 'deck', id: deck.id, zoneId: movingOut.zoneId }}
          card={movingOut.card}
          available={movingOut.quantity}
          onClose={() => setMovingOut(null)}
        />
      )}
      {showSampleHand && <SampleHandModal deck={deck} cardsById={cardsById} handSize={adapter.openingHandSize} onClose={() => setShowSampleHand(false)} />}
      {showBanList && <BanListEditor gameId={deck.gameId} initialFormatId={deck.formatId} onClose={() => setShowBanList(false)} />}
    </div>
  )
}
