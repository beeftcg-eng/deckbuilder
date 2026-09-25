import { MoveCardsModal } from './MoveCardsModal'
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { formatPrice, gameIdOfCardId, totalPrice } from '../shared/collection'
import type { Card, GameId } from '../shared/types'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

/** The binder picker grid, shown when no binder is currently open. */
function BinderList() {
  const binders = useAppStore((s) => s.binders)
  const createBinder = useAppStore((s) => s.createBinder)
  const selectBinder = useAppStore((s) => s.selectBinder)
  const [nameDraft, setNameDraft] = useState('')

  return (
    <div className="wishlist-panel md-panel">
      <div className="wishlist-header">
        <h2>{t.binders.title}</h2>
        <span className="text-dim">{t.binders.count(binders.length)}</span>
      </div>
      <div className="text-dim">{t.binders.intro}</div>
      <div className="col-controls">
        <input
          className="search-input"
          placeholder={t.binders.newName}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !nameDraft.trim()) return
            createBinder(nameDraft.trim())
            setNameDraft('')
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => {
            createBinder(nameDraft.trim() || undefined)
            setNameDraft('')
          }}
        >
          {t.binders.newBinder}
        </button>
      </div>
      {binders.length === 0 ? (
        <div className="text-dim">{t.binders.none}</div>
      ) : (
        <div className="md-grid">
          {binders.map((binder) => {
            const copies = Object.values(binder.cards).reduce((n, q) => n + q, 0)
            return (
              <div key={binder.id} className="md-card" role="button" tabIndex={0} onClick={() => selectBinder(binder.id)} title={t.binders.open(binder.name)}>
                <div className="md-card-body">
                  <div className="md-card-name">{binder.name}</div>
                  <div className="md-card-counts">
                    <Rich text={t.binders.cardCount(Object.keys(binder.cards).length)} />
                    {copies !== Object.keys(binder.cards).length && <span className="text-dim">{t.binders.copies(copies)}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** The open binder's own card list, grouped by game like the wishlist. */
function OpenBinder({ binderId }: { binderId: string }) {
  const binder = useAppStore((s) => s.binders.find((b) => b.id === binderId))
  const catalogs = useAppStore((s) => s.catalogs)
  const syncMeta = useAppStore((s) => s.syncMeta)
  const loadCatalog = useAppStore((s) => s.loadCatalog)
  const selectBinder = useAppStore((s) => s.selectBinder)
  const renameBinder = useAppStore((s) => s.renameBinder)
  const duplicateBinder = useAppStore((s) => s.duplicateBinder)
  const deleteBinder = useAppStore((s) => s.deleteBinder)
  const setBinderCardQuantity = useAppStore((s) => s.setBinderCardQuantity)
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ card: Card; quantity: number } | null>(null)

  const cardIds = useMemo(() => (binder ? Object.keys(binder.cards) : []), [binder])

  // A binder can span games whose catalog isn't loaded yet.
  useEffect(() => {
    for (const gameId of new Set(cardIds.flatMap((id) => (gameIdOfCardId(id) ? [gameIdOfCardId(id)!] : [])))) {
      const meta = syncMeta[gameId]
      if (meta && meta.count > 0 && !catalogs[gameId]) loadCatalog(gameId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIds, syncMeta])

  const grouped = useMemo(() => {
    if (!binder) return new Map<GameId, { card: Card; quantity: number }[]>()
    const byGame = new Map<GameId, { card: Card; quantity: number }[]>()
    for (const [cardId, quantity] of Object.entries(binder.cards)) {
      const gameId = gameIdOfCardId(cardId)
      const card = gameId ? catalogs[gameId]?.byId.get(cardId) : undefined
      if (!gameId || !card) continue
      const list = byGame.get(gameId) ?? []
      list.push({ card, quantity })
      byGame.set(gameId, list)
    }
    return byGame
  }, [binder, catalogs])

  const value = useMemo(() => totalPrice([...grouped.values()].flat()), [grouped])
  const totalCopies = [...grouped.values()].flat().reduce((sum, e) => sum + e.quantity, 0)

  if (!binder) return null

  function commitName() {
    const trimmed = nameDraft?.trim()
    setNameDraft(null)
    if (trimmed) renameBinder(binderId, trimmed)
  }

  return (
    <div className="wishlist-panel">
      <div className="wishlist-header">
        <button className="btn" onClick={() => selectBinder(null)} title={t.binders.backTitle}>
          {t.binders.back}
        </button>
        {nameDraft != null ? (
          <input
            className="deck-name-input"
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => (e.key === 'Enter' ? commitName() : e.key === 'Escape' ? setNameDraft(null) : undefined)}
          />
        ) : (
          <h2 onClick={() => setNameDraft(binder.name)} title={t.binders.renameTitle}>
            {binder.name}
          </h2>
        )}
        <div className="wishlist-header-actions">
          <span className="text-dim">
            {t.binders.summary(cardIds.length, totalCopies)}
            {value.total > 0 ? ` · ≈ ${formatPrice(value.total)}` : ''}
          </span>
          <button className="btn" title={t.binders.duplicateTitle} onClick={() => duplicateBinder(binderId)}>
            {t.binders.duplicate}
          </button>
          <button
            className="btn"
            title={t.binders.deleteTitle}
            onClick={() => {
              if (confirm(t.binders.deleteConfirm(binder.name))) deleteBinder(binderId)
            }}
          >
            {t.binders.delete}
          </button>
        </div>
      </div>

      <div className="text-dim">{t.binders.howToAdd(binder.name)}</div>

      <div className="wishlist-groups">
        {cardIds.length === 0 && <div className="text-dim">{t.binders.empty}</div>}
        {[...grouped.entries()].map(([gameId, entries]) => {
          const adapter = getAdapter(gameId)
          return (
            <div key={gameId} className="wishlist-group">
              <div className="wishlist-group-header">{adapter.shortName}</div>
              {entries.map(({ card, quantity }) => (
                <div key={card.id} className="wishlist-row">
                  {card.imageUrlSmall ? <img className="wishlist-thumb" src={card.imageUrlSmall} alt={card.name} /> : <div className="wishlist-thumb wishlist-thumb-empty" />}
                  <div className="wishlist-row-name">
                    {card.name}
                    <span className="text-dim">
                      {' '}
                      — {card.setCode} #{card.number}
                      {card.rarity ? ` · ${card.rarity}` : ''}
                    </span>
                  </div>
                  {card.price != null && <span className="text-dim">{formatPrice(card.price * quantity)}</span>}
                  <div className="stepper">
                    <button className="btn stepper-btn" onClick={() => setBinderCardQuantity(binderId, card.id, quantity - 1)}>
                      −
                    </button>
                    <span className="stepper-value">{quantity}</span>
                    <button className="btn stepper-btn" onClick={() => setBinderCardQuantity(binderId, card.id, quantity + 1)}>
                      +
                    </button>
                  </div>
                  <button className="btn" title={t.binders.moveTitle} onClick={() => setMoving({ card, quantity })}>
                    {t.binders.move}
                  </button>
                  <button className="deck-row-delete" title={t.binders.remove} onClick={() => setBinderCardQuantity(binderId, card.id, 0)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      {moving && <MoveCardsModal from={{ kind: 'binder', id: binderId }} card={moving.card} available={moving.quantity} onClose={() => setMoving(null)} />}
    </div>
  )
}

export function BinderPanel() {
  const currentBinderId = useAppStore((s) => s.currentBinderId)
  return currentBinderId ? <OpenBinder key={currentBinderId} binderId={currentBinderId} /> : <BinderList />
}
