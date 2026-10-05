import { useMemo, useState } from 'react'
import { useAppStore, useCardsById, useOwnedIndex } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { isCardLegalInFormat } from '../shared/legality'
import { poolKey } from '../shared/collection'
import { currentDeckFor } from '../shared/decks'
import { rulesForFormat } from '../shared/games/rules'
import { identityColors } from '../shared/cardColors'
import { matchesSearch } from '../shared/cardSearch'
import { CARD_SORTS, availableSorts, isCardSort, sortCards, type CardSort } from '../shared/cardSort'
import { kindOptions, matchesKinds, matchesTypes, searchNamesCategory, typeOptions } from '../shared/cardFilters'
import type { Card, DeckRules } from '../shared/types'
import { CardTile } from './CardTile'
import { CardDetailModal } from './CardDetailModal'
import { t } from '../shared/i18n'

const PAGE_SIZE = 60
// The Sort menu's choice, remembered on this device for every game.
const SORT_KEY = 'brewhouse.browser.sort'

function loadSort(): CardSort {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    return isCardSort(saved) ? saved : 'relevance'
  } catch {
    return 'relevance'
  }
}

// Where a plain click puts a card: the first zone that takes it, skipping ones that are only filled deliberately (sideboard, commander).
function primaryZoneFor(card: Card, rules: DeckRules) {
  return rules.zones.find((z) => !z.freeText && !z.manualOnly && z.match(card))
}

/** The set with `value` added, or removed if it was there. */
function toggled(values: Set<string>, value: string): Set<string> {
  const next = new Set(values)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function CardBrowser() {
  const currentGameId = useAppStore((s) => s.currentGameId)
  const catalog = useAppStore((s) => s.catalogs[currentGameId])
  const currentDeckId = useAppStore((s) => s.currentDeckId)
  const decks = useAppStore((s) => s.decks)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const formats = useAppStore((s) => s.formats)
  const collection = useAppStore((s) => s.collection)
  const changeOwned = useAppStore((s) => s.changeOwned)
  const ownedIndex = useOwnedIndex()
  const cachedCount = useAppStore((s) => s.syncMeta[currentGameId]?.count ?? 0)

  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [kinds, setKinds] = useState<Set<string>>(new Set())
  const [setId, setSetId] = useState<string>('all')
  const [rarity, setRarity] = useState<string>('all')
  const [colors, setColors] = useState<Set<string>>(new Set())
  const [ownedOnly, setOwnedOnly] = useState(false)
  const [sort, setSortState] = useState<CardSort>(loadSort)
  const [showAllDuringStage, setShowAllDuringStage] = useState(false)
  // Phone only (app.css): the filter rows fold away behind a Filters button so the cards start near the top.
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const syncProgress = useAppStore((s) => s.syncProgress[currentGameId])
  const syncing = syncProgress != null && !syncProgress.done
  const [detailCard, setDetailCard] = useState<Card | null>(null)

  const showCollection = useAppStore((s) => s.showCollection)

  const deck = currentDeckFor(decks, currentDeckId, currentGameId)
  // Browsing for the collection isn't building the deck: its guided stage, format and Legend colours don't narrow the list.
  const filterDeck = showCollection ? undefined : deck
  const adapter = getAdapter(currentGameId)
  const cardsById = useCardsById(currentGameId)
  const stage = filterDeck ? (adapter.getGuidedStage?.(filterDeck, cardsById) ?? null) : null
  // A stage may let you switch its filter off (Magic's "Commanders only") to browse everything.
  const stageFilter = stage?.filter && !(stage.filterLabel && showAllDuringStage) ? stage.filter : undefined

  const gameFormats = filterDeck ? (formats[filterDeck.gameId] ?? adapter.defaultFormats) : []
  const format = filterDeck ? (gameFormats.find((f) => f.id === filterDeck.formatId) ?? gameFormats[0]) : undefined

  // The deck's shape (zones, limits) can depend on its format — Magic's Commander vs 60-card formats.
  const rules = deck ? rulesForFormat(adapter, deck.formatId) : adapter.deckRules

  const identityZoneId = rules.identityZoneId
  const identityCards = useMemo(() => {
    if (!filterDeck || !identityZoneId) return []
    return (filterDeck.zones[identityZoneId] ?? []).flatMap((entry) => {
      const card = cardsById.get(entry.cardId)
      return card ? [card] : []
    })
  }, [filterDeck, identityZoneId, cardsById])
  const identityKey = identityCards.map((c) => c.id).join('|')

  // When the deck's Leader/Legend/Commander changes, snap the color filter to its colors. Done
  // during render (React's "adjust state when a prop changes" pattern) rather than in
  // an effect, so the filter is right on the same paint instead of one frame late.
  const [lastIdentityKey, setLastIdentityKey] = useState('')

  // The filters belong to the game being browsed. This component stays mounted when you switch game tabs, and a
  // Riftbound deck's colours left on the filter meant Magic showed only colourless cards and Pokémon nothing at all.
  // Opening the collection starts it unfiltered too, instead of with whatever the deck was being browsed by;
  // going back to the deck snaps the colours to its Legend again (below).
  const [filterGameId, setFilterGameId] = useState(currentGameId)
  const [filterForCollection, setFilterForCollection] = useState(showCollection)
  if (filterGameId !== currentGameId || filterForCollection !== showCollection) {
    setFilterGameId(currentGameId)
    setFilterForCollection(showCollection)
    setQuery('')
    setTypes(new Set())
    setKinds(new Set())
    setSetId('all')
    setRarity('all')
    setOwnedOnly(false)
    setShowAllDuringStage(false)
    setColors(new Set())
    setLastIdentityKey('')
  }
  if (rules.colorLocked && identityKey !== lastIdentityKey) {
    setLastIdentityKey(identityKey)
    setColors(new Set(identityCards.flatMap(identityColors)))
  }

  // Every category is offered, including ones hidden from the default view (Riftbound's Legends and
  // Runes, Yu-Gi-Oh Tokens): picking one shows them.
  const typeChips = useMemo(() => (catalog ? typeOptions(catalog.cards, adapter.typeOrder) : []), [catalog, adapter])
  const kindChips = useMemo(() => (catalog ? kindOptions(catalog.cards, adapter.filterKinds) : []), [catalog, adapter])

  const sets = useMemo(() => {
    if (!catalog) return []
    const map = new Map<string, string>()
    for (const c of catalog.cards) {
      if (format && !isCardLegalInFormat(c, format).legal) continue
      map.set(c.setId, c.setName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [catalog, format])

  const rarities = useMemo(() => {
    if (!catalog) return []
    return [...new Set(catalog.cards.flatMap((c) => (c.rarity ? [c.rarity] : [])))].sort()
  }, [catalog])

  const allColors = useMemo(() => {
    if (!catalog) return []
    const order = adapter.colorOrder ?? []
    const rank = (color: string) => (order.includes(color) ? order.indexOf(color) : order.length)
    return [...new Set(catalog.cards.flatMap(identityColors))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  }, [catalog, adapter])

  // Sorts this game's cards can use: no date sorts without release dates (One Piece, or card data
  // synced before dates were stored), no price sorts without prices. A saved choice this game can't
  // use falls back to Best match here without being forgotten for the next game.
  const sorts = useMemo(() => (catalog ? availableSorts(catalog.cards) : []), [catalog])
  const activeSort: CardSort = sorts.includes(sort) ? sort : 'relevance'
  // Games whose source has dates, but whose cached cards don't yet: offer the date sorts disabled, with a hint.
  const datesNeedResync = !!adapter.hasReleaseDates && !sorts.includes('newest')

  function setSort(next: CardSort) {
    setSortState(next)
    try {
      localStorage.setItem(SORT_KEY, next)
    } catch {
      // Private mode: just not remembered.
    }
  }

  const results = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    // Categories kept out of the list unless asked for: by the Type chips, or by naming them in the search ("rune", "DON!!").
    const hidden = (adapter.mainDeckExcludedCategories ?? []).filter((category) => !(q && searchNamesCategory(q, category)))
    const filtered = catalog.cards.filter((c) => {
      // Format legality only means something for cards a deck can hold: DON!! and rune cards go in no zone, so they always show.
      if (format && !isCardLegalInFormat(c, format).legal && primaryZoneFor(c, rules)) return false
      if (stageFilter && !stageFilter(c)) return false
      if (!stageFilter) {
        if (types.size > 0) {
          if (!matchesTypes(c, types)) return false
        } else if (hidden.includes(c.category)) {
          return false
        }
      }
      if (!matchesKinds(c, kinds)) return false
      if (setId !== 'all' && c.setId !== setId) return false
      if (rarity !== 'all' && c.rarity !== rarity) return false
      if (colors.size > 0) {
        const cardColors = identityColors(c)
        let matches: boolean
        if (adapter.identityColorFilter) {
          // Colorless cards fit any deck; a color-locked deck can only use cards entirely inside its colors.
          matches = cardColors.length === 0 || (rules.colorLocked ? cardColors.every((col) => colors.has(col)) : cardColors.some((col) => colors.has(col)))
        } else {
          matches = cardColors.some((col) => colors.has(col))
        }
        if (!matches) return false
      }
      if (ownedOnly && !ownedIndex.get(poolKey(c))) return false
      if (q && !matchesSearch(c, q)) return false
      return true
    })
    return sortCards(filtered, activeSort, q)
  }, [catalog, query, types, kinds, setId, rarity, colors, stageFilter, adapter, rules, format, ownedOnly, ownedIndex, activeSort])

  // "Show more" only applies to the filters it was clicked under; any filter change starts back at one page.
  const filterKey = [query, [...types].sort().join(','), [...kinds].sort().join(','), setId, rarity, [...colors].sort().join(','), ownedOnly, activeSort, currentGameId, stage?.label ?? '', stageFilter ? 1 : 0].join('|')
  const [page, setPage] = useState({ key: filterKey, count: PAGE_SIZE })
  const visibleCount = page.key === filterKey ? page.count : PAGE_SIZE

  function toggleColor(color: string) {
    setColors((prev) => {
      const next = new Set(prev)
      if (next.has(color)) next.delete(color)
      else next.add(color)
      return next
    })
  }

  if (!catalog && cachedCount > 0) {
    // The card data is on disk and on its way (a big game like Magic takes a moment) — it isn't missing.
    return (
      <div className="card-browser empty-state" data-tour="browser">
        <p>{t.browser.loading(adapter.shortName)}</p>
      </div>
    )
  }

  if (!catalog || catalog.cards.length === 0) {
    return (
      <div className="card-browser empty-state" data-tour="browser">
        <p>{t.browser.noData(adapter.shortName)}</p>
        <p className="text-dim desktop-only">{t.browser.noDataHelp}</p>
        <button className="btn btn-primary mobile-only" disabled={syncing} onClick={() => useAppStore.getState().syncCatalog(currentGameId)}>
          {syncing ? t.sidebar.syncing(syncProgress?.loaded ?? 0, syncProgress?.total ?? '?') : t.sidebar.syncCardData}
        </button>
      </div>
    )
  }

  const visible = results.slice(0, visibleCount)
  const activeFilterCount = types.size + kinds.size + colors.size + (setId !== 'all' ? 1 : 0) + (rarity !== 'all' ? 1 : 0) + (ownedOnly ? 1 : 0)

  return (
    <div className={`card-browser ${mobileFiltersOpen ? '' : 'mobile-filters-closed'}`} data-tour="browser">
      <div className="card-browser-controls">
        <input
          className="search-input"
          placeholder={t.browser.search(adapter.shortName)}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className={`btn mobile-only mobile-filter-toggle ${activeFilterCount > 0 ? 'has-filters' : ''}`}
          aria-expanded={mobileFiltersOpen}
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
        >
          {activeFilterCount > 0 ? t.mobile.filtersActive(activeFilterCount) : t.mobile.filters} {mobileFiltersOpen ? '▴' : '▾'}
        </button>
        <label className="owned-only mobile-filter" title={Object.keys(collection).length === 0 ? t.browser.ownedNone : t.browser.ownedTitle}>
          <input type="checkbox" checked={ownedOnly} disabled={Object.keys(collection).length === 0} onChange={(e) => setOwnedOnly(e.target.checked)} />
          {t.browser.owned}
        </label>
        <select className="mobile-filter" value={setId} onChange={(e) => setSetId(e.target.value)}>
          <option value="all">{t.browser.allSets}</option>
          {sets.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {rarities.length > 0 && (
          <select className="mobile-filter" value={rarity} onChange={(e) => setRarity(e.target.value)}>
            <option value="all">{t.browser.allRarities}</option>
            {rarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <select className="mobile-filter" aria-label={t.browser.sortBy} title={t.browser.sortBy} value={activeSort} onChange={(e) => isCardSort(e.target.value) && setSort(e.target.value)}>
          {CARD_SORTS.filter((s) => sorts.includes(s) || (datesNeedResync && (s === 'newest' || s === 'oldest'))).map((s) => (
            <option key={s} value={s} disabled={!sorts.includes(s)}>
              {sorts.includes(s) ? t.browser.sorts[s] : t.browser.sortNeedsResync(t.browser.sorts[s])}
            </option>
          ))}
        </select>
      </div>

      {deck?.locked && (
        <div className="lock-banner">{t.browser.locked(deck.name)}</div>
      )}

      {stage && !deck?.locked && (
        <div className="stage-banner">
          <span>{stage.label}</span>
          {stage.filterLabel && (
            <label className="stage-toggle">
              <input type="checkbox" checked={!showAllDuringStage} onChange={(e) => setShowAllDuringStage(!e.target.checked)} />
              {stage.filterLabel}
            </label>
          )}
        </div>
      )}

      {!stageFilter && typeChips.length > 1 && (
        <div className="color-filter-row mobile-filter" role="group" aria-label={t.browser.cardType}>
          <span className="filter-row-label text-dim">{t.browser.type}</span>
          {typeChips.map((type) => (
            <button key={type} className={`color-chip ${types.has(type) ? 'active' : ''}`} aria-pressed={types.has(type)} onClick={() => setTypes(toggled(types, type))}>
              {type}
            </button>
          ))}
          {types.size > 0 && (
            <button className="color-chip clear" onClick={() => setTypes(new Set())}>
              {t.browser.clear}
            </button>
          )}
        </div>
      )}
      {kindChips.length > 0 && (
        <div className="color-filter-row mobile-filter" role="group" aria-label={t.browser.kind}>
          <span className="filter-row-label text-dim">{t.browser.kind}</span>
          {kindChips.map((k) => (
            <button key={k} className={`color-chip ${kinds.has(k) ? 'active' : ''}`} aria-pressed={kinds.has(k)} onClick={() => setKinds(toggled(kinds, k))}>
              {k}
            </button>
          ))}
          {kinds.size > 0 && (
            <button className="color-chip clear" onClick={() => setKinds(new Set())}>
              {t.browser.clear}
            </button>
          )}
        </div>
      )}

      {allColors.length > 0 && (
        <div className="color-filter-row mobile-filter">
          {allColors.map((color) => (
            <button
              key={color}
              className={`color-chip ${colors.has(color) ? 'active' : ''}`}
              onClick={() => toggleColor(color)}
            >
              {color}
            </button>
          ))}
          {colors.size > 0 && (
            <button className="color-chip clear" onClick={() => setColors(new Set())}>
              {t.browser.clear}
            </button>
          )}
        </div>
      )}

      <div className="card-browser-count text-dim">
        {t.browser.matches(results.length)}
      </div>

      <div className="card-grid">
        {visible.map((card) => {
          // A guided stage's targetZoneId is a *default* for whatever the
          // stage is generally about (e.g. "Fill your Sideboard"), not a
          // dump zone for every card shown alongside it — a card that
          // doesn't actually belong in that zone (e.g. a Battlefield showing
          // up during the sideboard stage) still goes to wherever it
          // naturally matches instead of being miscategorized.
          const targetZone = stage?.targetZoneId ? rules.zones.find((z) => z.id === stage.targetZoneId) : undefined
          const zone = targetZone && targetZone.match(card) ? targetZone : primaryZoneFor(card, rules)
          const quantity = deck && zone ? (deck.zones[zone.id] ?? []).find((e) => e.cardId === card.id)?.quantity ?? 0 : 0
          const maxQuantity = zone?.maxCopiesPerCard ?? adapter.copyLimitFor?.(card) ?? rules.defaultMaxCopiesPerCard
          return (
            <CardTile
              key={card.id}
              card={card}
              quantity={quantity}
              maxQuantity={maxQuantity}
              owned={collection[card.id] ?? 0}
              ownedTotal={ownedIndex.get(poolKey(card)) ?? 0}
              onOwnedChange={(delta) => changeOwned(card.id, delta)}
              disabled={!deck || !zone || deck.locked}
              onChange={(q) => zone && setCardQuantity(zone.id, card, q)}
              onOpenDetail={() => setDetailCard(card)}
            />
          )
        })}
      </div>

      {visibleCount < results.length && (
        <button className="btn load-more-btn" onClick={() => setPage({ key: filterKey, count: visibleCount + PAGE_SIZE })}>
          {t.browser.showMore(Math.min(PAGE_SIZE, results.length - visibleCount), visibleCount, results.length)}
        </button>
      )}

      {detailCard && <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />}
    </div>
  )
}
