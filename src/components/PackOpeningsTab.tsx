import { useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { formatPrice } from '../shared/collection'
import { displayCurrency, displayRate } from '../shared/currency'
import { matchesSearch, matchRank } from '../shared/cardSearch'
import { newOpening, openingValue, type PackOpening } from '../shared/packOpenings'
import { targetToUsd } from '../shared/priceAlerts'
import type { Card, GameId } from '../shared/types'
import { getLanguage, t } from '../shared/i18n'
import { lazyModal } from './lazyModal'

const PackShareModal = lazyModal(() => import('./PackShareModal'), 'PackShareModal')

const SEARCH_LIMIT = 12

function ResultLine({ result, share }: { result: number | null; share: number | null }) {
  if (result == null || share == null) return null
  const percent = Math.round(Math.abs(share) * 100)
  return <span className={result >= 0 ? 'fv-legal' : 'fv-illegal'}>{result >= 0 ? t.packs.up(formatPrice(result), percent) : t.packs.down(formatPrice(-result), percent)}</span>
}

function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(getLanguage(), { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Collection → Pack openings: what you paid, what you pulled, and what that's worth now (shared/packOpenings.ts). */
export function PackOpeningsTab({ gameId, cards, byId }: { gameId: GameId; cards: readonly Card[]; byId: Map<string, Card> }) {
  const all = useAppStore((s) => s.settings.packOpenings)
  const activeId = useAppStore((s) => s.activeOpeningId)
  const { setActiveOpening, savePackOpening, deletePackOpening, changePackPull } = useAppStore.getState()
  const openings = useMemo(() => (all ?? []).filter((o) => o.gameId === gameId), [all, gameId])
  const active = openings.find((o) => o.id === activeId) ?? null
  const lookup = (id: string) => byId.get(id)

  const latestSet = useMemo(() => [...cards].sort((a, b) => b.setId.localeCompare(a.setId))[0]?.setName ?? '', [cards])
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [toCollection, setToCollection] = useState(true)
  const [query, setQuery] = useState('')

  function create() {
    const opening = newOpening(gameId, name.trim() || t.packs.defaultName(latestSet), targetToUsd(cost, displayRate()), toCollection)
    savePackOpening(opening)
    setActiveOpening(opening.id)
    setName('')
    setCost('')
  }

  if (active) return <OpeningDetail opening={active} cards={cards} lookup={lookup} query={query} setQuery={setQuery} onChange={changePackPull} onSave={savePackOpening} onBack={() => setActiveOpening(null)} onDelete={() => { if (confirm(t.packs.deleteConfirm(active.name))) deletePackOpening(active.id) }} />

  const values = openings.map((o) => ({ opening: o, value: openingValue(o, lookup) }))
  const spent = openings.reduce((n, o) => n + (o.costUsd ?? 0), 0)
  const worth = values.reduce((n, v) => n + v.value.value, 0)

  return (
    <div className="packs">
      <div className="text-dim">{t.packs.intro}</div>
      <form className="packs-new" onSubmit={(e) => (e.preventDefault(), create())}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.packs.namePlaceholder} />
        <input className="packs-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={t.packs.cost(displayCurrency())} aria-label={t.packs.cost(displayCurrency())} />
        <label className="packs-check">
          <input type="checkbox" checked={toCollection} onChange={(e) => setToCollection(e.target.checked)} /> {t.packs.addToCollection}
        </label>
        <button className="btn btn-primary" type="submit">
          {t.packs.create}
        </button>
      </form>

      {openings.length === 0 ? (
        <div className="text-dim">{t.packs.none}</div>
      ) : (
        <>
          {openings.length > 1 && <div className="text-dim">{t.packs.totals(formatPrice(spent), formatPrice(worth))}</div>}
          <div className="col-list">
            {values.map(({ opening, value }) => (
              <button key={opening.id} className="col-row packs-row" onClick={() => setActiveOpening(opening.id)}>
                {value.best?.card.imageUrlSmall ? <img className="deck-entry-thumb" src={value.best.card.imageUrlSmall} alt="" loading="lazy" /> : <span className="deck-entry-thumb" />}
                <span className="packs-row-main">
                  <span className="col-name">{opening.name}</span>
                  <span className="text-dim">{t.packs.row(dateLabel(opening.date), value.copies)}</span>
                </span>
                <span className="packs-row-money">
                  <span>{t.packs.worth(formatPrice(value.value))}</span>
                  <ResultLine result={value.result} share={value.resultShare} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function OpeningDetail(props: {
  opening: PackOpening
  cards: readonly Card[]
  lookup: (id: string) => Card | undefined
  query: string
  setQuery: (q: string) => void
  onChange: (openingId: string, cardId: string, delta: number) => Promise<void>
  onSave: (o: PackOpening) => void
  onBack: () => void
  onDelete: () => void
}) {
  const { opening, cards, lookup, query, setQuery, onChange, onSave, onBack, onDelete } = props
  const value = openingValue(opening, lookup)
  const rate = displayRate()
  const [sharing, setSharing] = useState(false)
  const [costText, setCostText] = useState(() => (opening.costUsd != null ? (opening.costUsd * rate).toFixed(displayCurrency() === 'JPY' ? 0 : 2) : ''))
  const q = query.trim().toLowerCase()
  const results = useMemo(
    () => (q.length < 2 ? [] : cards.filter((c) => matchesSearch(c, q)).sort((a, b) => matchRank(a, q) - matchRank(b, q) || a.name.localeCompare(b.name)).slice(0, SEARCH_LIMIT)),
    [cards, q],
  )

  return (
    <div className="packs">
      <div className="packs-detail-head">
        <button className="btn" onClick={onBack}>
          {t.packs.back}
        </button>
        {__SCANNER__ && (
          <button className="btn btn-primary" title={t.packs.scanTitle} onClick={() => useAppStore.getState().setShowScanner(true)}>
            {t.packs.scan}
          </button>
        )}
        {opening.pulls.length > 0 && (
          <button className="btn" title={t.packs.shareTitle} onClick={() => setSharing(true)}>
            {t.packs.share}
          </button>
        )}
      </div>
      {sharing && <PackShareModal opening={opening} lookup={lookup} date={dateLabel(opening.date)} onClose={() => setSharing(false)} />}
      <div className="packs-new">
        <input value={opening.name} onChange={(e) => onSave({ ...opening, name: e.target.value })} aria-label={t.packs.namePlaceholder} />
        <input
          className="packs-cost"
          inputMode="decimal"
          value={costText}
          onChange={(e) => setCostText(e.target.value)}
          onBlur={() => onSave({ ...opening, costUsd: targetToUsd(costText, rate) })}
          placeholder={t.packs.cost(displayCurrency())}
          aria-label={t.packs.cost(displayCurrency())}
        />
      </div>
      <div className="packs-summary">
        <b>{t.packs.worth(formatPrice(value.value))}</b>
        {opening.costUsd != null && <span className="text-dim">{t.packs.paid(formatPrice(opening.costUsd))}</span>}
        <ResultLine result={value.result} share={value.resultShare} />
        {value.unpricedCopies > 0 && <span className="text-dim">{t.packs.unpriced(value.unpricedCopies)}</span>}
      </div>
      {value.best && <div className="text-dim">{t.packs.bestPull(value.best.card.name, formatPrice(value.best.value))}</div>}
      <div className="text-dim packs-note">{opening.addToCollection ? t.packs.inCollection : t.packs.notInCollection}</div>

      <input className="search-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.packs.searchPlaceholder} />
      {results.length > 0 && (
        <div className="packs-results">
          {results.map((card) => (
            <button key={card.id} className="packs-result" onClick={() => void onChange(opening.id, card.id, 1)}>
              {card.imageUrlSmall ? <img className="deck-entry-thumb" src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="deck-entry-thumb" />}
              <span className="col-name">{card.name}</span>
              <span className="text-dim">
                {card.setCode} · {card.number}
                {card.price != null ? ` · ${formatPrice(card.price)}` : ''}
              </span>
              <span>＋</span>
            </button>
          ))}
        </div>
      )}

      {opening.pulls.length === 0 ? (
        <div className="text-dim">{t.packs.empty}</div>
      ) : (
        <div className="col-list">
          {opening.pulls.map(({ cardId, quantity }) => {
            const card = lookup(cardId)
            return (
              <div key={cardId} className="col-row">
                {card?.imageUrlSmall ? <img className="deck-entry-thumb" src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="deck-entry-thumb" />}
                <span className="col-name">{card?.name ?? cardId}</span>
                <span className="text-dim col-meta">{card ? `${card.setCode} · ${card.number}${card.rarity ? ` · ${card.rarity}` : ''}` : ''}</span>
                {card?.price != null && <span className="text-dim col-price">{formatPrice(card.price * quantity)}</span>}
                <div className="stepper">
                  <button className="btn stepper-btn" onClick={() => void onChange(opening.id, cardId, -1)}>
                    −
                  </button>
                  <span className="stepper-value">{quantity}</span>
                  <button className="btn stepper-btn" onClick={() => void onChange(opening.id, cardId, 1)}>
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div>
        <button className="btn" onClick={onDelete}>
          {t.packs.delete}
        </button>
      </div>
    </div>
  )
}
