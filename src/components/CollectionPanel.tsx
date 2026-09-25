import { matchesPrintedCode } from '../shared/cardSearch'
import { useMemo, useRef, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { formatPrice, gameIdOfCardId, totalPrice } from '../shared/collection'
import { summarizeSets, topUpItems, unownedUnwishlisted } from '../shared/setProgress'
import type { Card } from '../shared/types'
import { CardDetailModal } from './CardDetailModal'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

type Tab = 'cards' | 'sets'
type Sort = 'name' | 'set' | 'copies' | 'value'

const PAGE_SIZE = 150
const COPY_CHOICES = [1, 2, 3, 4]

interface OwnedEntry {
  card: Card
  copies: number
}

/** Your collection for the game being browsed: the cards you own, and set-by-set progress with bulk add. */
export function CollectionPanel() {
  const currentGameId = useAppStore((s) => s.currentGameId)
  const catalog = useAppStore((s) => s.catalogs[currentGameId])
  const collection = useAppStore((s) => s.collection)
  const wishlist = useAppStore((s) => s.wishlist)
  const changeOwned = useAppStore((s) => s.changeOwned)
  const addToCollection = useAppStore((s) => s.addToCollection)
  const forTrade = useAppStore((s) => s.forTrade)
  const toggleForTrade = useAppStore((s) => s.toggleForTrade)
  const tradeProfile = useAppStore((s) => s.settings.tradeProfile)
  const wishlistCards = useAppStore((s) => s.wishlistCards)
  const adapter = getAdapter(currentGameId)

  const [tab, setTab] = useState<Tab>('cards')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [copiesEach, setCopiesEach] = useState(1)
  const [limit, setLimit] = useState({ key: '', count: PAGE_SIZE })
  const [message, setMessage] = useState<string | null>(null)
  const [detail, setDetail] = useState<Card | null>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const cards = useMemo(() => catalog?.cards ?? [], [catalog])

  const owned = useMemo(() => {
    const entries: OwnedEntry[] = []
    let unknown = 0
    for (const [cardId, copies] of Object.entries(collection)) {
      if (gameIdOfCardId(cardId) !== currentGameId) continue
      const card = catalog?.byId.get(cardId)
      if (card) entries.push({ card, copies })
      else unknown += 1 // owned, but the card isn't in the loaded data (not synced, or dropped from the source)
    }
    return { entries, unknown }
  }, [collection, catalog, currentGameId])

  const totalCopies = owned.entries.reduce((sum, e) => sum + e.copies, 0)
  const value = totalPrice(owned.entries.map((e) => ({ card: e.card, quantity: e.copies })))

  const needle = query.trim().toLowerCase()
  const visibleOwned = useMemo(() => {
    const matching = needle
      ? owned.entries.filter((e) => e.card.name.toLowerCase().includes(needle) || e.card.setName.toLowerCase().includes(needle) || e.card.setCode.toLowerCase() === needle || matchesPrintedCode(e.card, needle))
      : owned.entries
    const compare: Record<Sort, (a: OwnedEntry, b: OwnedEntry) => number> = {
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      set: (a, b) => a.card.setName.localeCompare(b.card.setName) || a.card.number.localeCompare(b.card.number, undefined, { numeric: true }),
      copies: (a, b) => b.copies - a.copies || a.card.name.localeCompare(b.card.name),
      value: (a, b) => (b.card.price ?? 0) * b.copies - (a.card.price ?? 0) * a.copies || a.card.name.localeCompare(b.card.name),
    }
    return [...matching].sort(compare[sort])
  }, [owned, needle, sort])

  const cardsBySet = useMemo(() => {
    const map = new Map<string, Card[]>()
    for (const card of cards) map.set(card.setId, [...(map.get(card.setId) ?? []), card])
    return map
  }, [cards])
  const sets = useMemo(() => summarizeSets(cards, collection), [cards, collection])
  const wishlistedIds = useMemo(() => new Set(wishlist.map((e) => e.cardId)), [wishlist])
  const visibleSets = needle ? sets.filter((s) => s.setName.toLowerCase().includes(needle) || s.setCode.toLowerCase().includes(needle)) : sets

  const filterKey = `${currentGameId}|${tab}|${needle}|${sort}`
  const shown = limit.key === filterKey ? limit.count : PAGE_SIZE

  function flash(text: string) {
    setMessage(text)
    clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => setMessage(null), 4500)
  }

  async function handleAddSet(setId: string, setName: string) {
    const items = topUpItems(cardsBySet.get(setId) ?? [], collection, copiesEach)
    if (items.length === 0) return
    const copies = items.reduce((sum, i) => sum + i.quantity, 0)
    const ok = confirm(t.collection.addSetConfirm(copies, copiesEach, items.length, setName))
    if (!ok) return
    const added = await addToCollection(items)
    flash(t.collection.addedFromSet(added, setName))
  }

  async function handleWishlistSet(setId: string, setName: string) {
    const missing = unownedUnwishlisted(cardsBySet.get(setId) ?? [], collection, wishlistedIds)
    const count = await wishlistCards(missing)
    flash(count > 0 ? t.collection.wishlistedFromSet(count, setName) : t.collection.nothingToWishlist)
  }

  return (
    <div className="wishlist-panel collection-panel">
      <div className="wishlist-header">
        <h2>{t.collection.title(adapter.shortName)}</h2>
        <span className="text-dim">
          {t.common.cards(owned.entries.length)} · {t.collection.copies(totalCopies)}
          {adapter.hasPrices && value.total > 0 ? ` · ≈ ${formatPrice(value.total)}` : ''}
        </span>
      </div>

      <div className="fv-modes col-tabs" role="tablist">
        <button className={tab === 'cards' ? 'btn btn-primary' : 'btn'} aria-pressed={tab === 'cards'} onClick={() => setTab('cards')}>
          {t.collection.myCards}
        </button>
        <button className={tab === 'sets' ? 'btn btn-primary' : 'btn'} aria-pressed={tab === 'sets'} onClick={() => setTab('sets')}>
          {t.collection.sets}
        </button>
      </div>

      {!catalog || cards.length === 0 ? (
        <div className="text-dim">{t.collection.noData(adapter.shortName)}</div>
      ) : (
        <>
          <div className="col-controls">
            <input
              className="search-input"
              placeholder={tab === 'cards' ? t.collection.searchCards : t.collection.searchSets}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {tab === 'cards' ? (
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} title={t.myDecks.sort}>
                <option value="name">{t.collection.sortName}</option>
                <option value="set">{t.collection.sortSet}</option>
                <option value="copies">{t.collection.sortCopies}</option>
                {adapter.hasPrices && <option value="value">{t.collection.sortValue}</option>}
              </select>
            ) : (
              <label className="col-copies" title={t.collection.copiesTitle}>
                <span className="text-dim">{t.collection.ownAtLeast}</span>
                <select value={copiesEach} onChange={(e) => setCopiesEach(Number(e.target.value))}>
                  {COPY_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n}×
                    </option>
                  ))}
                </select>
                <span className="text-dim">{t.collection.ofEach}</span>
              </label>
            )}
          </div>

          {message && <div className="text-dim">{message}</div>}

          {tab === 'cards' ? (
            <>
              {owned.entries.length === 0 && (
                <div className="text-dim">
                  <Rich text={t.collection.none(adapter.shortName)} />
                </div>
              )}
              {owned.unknown > 0 && (
                <div className="text-dim">{t.collection.unknown(owned.unknown)}</div>
              )}
              <div className="col-list">
                {visibleOwned.slice(0, shown).map(({ card, copies }) => (
                  <div key={card.id} className="col-row">
                    <button className="col-card-link" onClick={() => setDetail(card)} title={t.collection.details}>
                      {card.imageUrlSmall ? <img className="deck-entry-thumb" src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="deck-entry-thumb" />}
                      <span className="col-name">{card.name}</span>
                    </button>
                    <span className="text-dim col-meta">
                      {card.setCode} · {card.number}
                      {card.rarity ? ` · ${card.rarity}` : ''}
                    </span>
                    {card.price != null && <span className="text-dim col-price">{formatPrice(card.price * copies)}</span>}
                    <label
                      className="col-for-trade"
                      title={tradeProfile?.public ? t.collection.forTradeTitle : t.collection.forTradeOffTitle}
                    >
                      <input type="checkbox" checked={forTrade.has(card.id)} onChange={() => toggleForTrade(card.id)} />
                      {t.collection.forTrade}
                    </label>
                    <div className="stepper">
                      <button className="btn stepper-btn" onClick={() => changeOwned(card.id, -1)}>
                        −
                      </button>
                      <span className="stepper-value">{copies}</span>
                      <button className="btn stepper-btn" onClick={() => changeOwned(card.id, 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {shown < visibleOwned.length && (
                <button className="btn" onClick={() => setLimit({ key: filterKey, count: shown + PAGE_SIZE })}>
                  {t.browser.showMore(Math.min(PAGE_SIZE, visibleOwned.length - shown), shown, visibleOwned.length)}
                </button>
              )}
            </>
          ) : (
            <>
              {adapter.setNote && <div className="text-dim col-note">{t.collection.setNotes[adapter.id] ?? adapter.setNote}</div>}
              <div className="col-list">
                {visibleSets.slice(0, shown).map((set) => {
                  const inSet = cardsBySet.get(set.setId) ?? []
                  const toAdd = topUpItems(inSet, collection, copiesEach).length
                  const toWishlist = unownedUnwishlisted(inSet, collection, wishlistedIds).length
                  const percent = set.total > 0 ? Math.round((set.owned / set.total) * 100) : 0
                  return (
                    <div key={set.setId} className="col-row col-set-row">
                      <div className="col-set-info">
                        <div className="col-name">
                          {set.setName} <span className="text-dim">({set.setCode})</span>
                        </div>
                        <div className="col-progress" title={t.collection.setProgress(set.owned, set.total)}>
                          <div className="col-progress-fill" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                      <span className="text-dim col-meta">
                        {set.owned}/{set.total} · {percent}%
                      </span>
                      <button
                        className="btn"
                        disabled={toAdd === 0}
                        onClick={() => handleAddSet(set.setId, set.setName)}
                        title={toAdd === 0 ? t.collection.ownAll(copiesEach) : t.collection.addMissingTitle(copiesEach)}
                      >
                        {toAdd === 0 ? t.collection.complete : t.collection.addMissing(toAdd)}
                      </button>
                      <button className="btn" disabled={toWishlist === 0} onClick={() => handleWishlistSet(set.setId, set.setName)} title={t.collection.wishlistSetTitle}>
                        {t.collection.wishlistSet(toWishlist)}
                      </button>
                    </div>
                  )
                })}
              </div>
              {shown < visibleSets.length && (
                <button className="btn" onClick={() => setLimit({ key: filterKey, count: shown + PAGE_SIZE })}>
                  {t.collection.showMore(shown, visibleSets.length)}
                </button>
              )}
              {visibleSets.length === 0 && <div className="text-dim">{t.collection.noSets}</div>}
            </>
          )}
        </>
      )}

      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
