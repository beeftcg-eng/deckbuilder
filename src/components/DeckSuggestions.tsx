import { useMemo, useState } from 'react'
import { useAppStore, useCardsById, useOwnedIndex } from '../state/useAppStore'
import { useCommunityLists } from '../state/communityLists'
import { listsForLegend, recommendCards, suggestRunes, weakestCards, type CardSuggestion, type CutCandidate } from '../shared/communityMeta'
import { codeIndex } from '../shared/riftboundDeckCode'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { cheapestPrinting } from '../shared/buyList'
import { formatPrice, poolKey } from '../shared/collection'
import type { Deck, DeckFreeTextEntry } from '../shared/types'
import { t, zoneLabel } from '../shared/i18n'

/** Fewer lists than this and the suggestions say so instead of guessing. */
const MIN_LISTS = 5
const OPEN_KEY = 'brewhouse.deckSuggestions.open'
const SORT_KEY = 'brewhouse.deckSuggestions.sort'
const SORTS = ['fit', 'owned', 'budget'] as const
type SuggestionSort = (typeof SORTS)[number]

function saved(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // not remembered, that's all
  }
}

const sameSplit = (a: readonly DeckFreeTextEntry[], b: readonly DeckFreeTextEntry[]) => {
  const key = (e: readonly DeckFreeTextEntry[]) => e.filter((r) => r.quantity > 0).map((r) => `${r.label}:${r.quantity}`).sort().join('|')
  return key(a) === key(b)
}

interface Row extends CardSuggestion {
  copies: number
  owned: number
  /** USD for the copies you don't own, at the cheapest printing; null when unpriced. */
  cost: number | null
  /** For a full zone: the deck card to take out for it. */
  swap: CutCandidate | null
}

/**
 * 💡 Suggestions, in a Riftbound deck's editor once it has cards: what the recent lists with its
 * Legend play that it doesn't yet, the lists closest to it counting most (communityMeta.ts
 * recommendCards), each a click to add at its usual number of copies. A full zone gets swaps
 * instead (the card those lists play least out, the suggestion in), the sideboard its own few, and
 * the Rune Deck the split those lists use. Sorted by fit, by what you own, or by cost to finish.
 * Closed until opened (and remembered), so the lists are only read when wanted.
 */
export function DeckSuggestions({ deck }: { deck: Deck }) {
  const cardsById = useCardsById('riftbound')
  const cards = useAppStore((s) => s.catalogs.riftbound?.cards)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const updateDeck = useAppStore((s) => s.updateDeck)
  const tracking = useAppStore((s) => Object.keys(s.collection).length > 0)
  const ownedIndex = useOwnedIndex()
  const legendCard = cardsById.get(deck.zones.legend?.[0]?.cardId ?? '')
  const [open, setOpenState] = useState(() => saved(OPEN_KEY) === '1')
  const [sort, setSortState] = useState<SuggestionSort>(() => SORTS.find((s) => s === saved(SORT_KEY)) ?? 'fit')
  const { lists } = useCommunityLists(open)
  const zones = useMemo(() => rulesForFormat(getAdapter('riftbound'), deck.formatId).zones, [deck.formatId])

  const setOpen = (next: boolean) => {
    setOpenState(next)
    remember(OPEN_KEY, next ? '1' : '0')
  }
  const setSort = (next: SuggestionSort) => {
    setSortState(next)
    remember(SORT_KEY, next)
  }

  const legendDecks = useMemo(
    () => (open && lists && legendCard ? listsForLegend(lists, legendCard, codeIndex(cardsById.values())) : null),
    [open, lists, legendCard, cardsById],
  )
  const enough = !!legendDecks && legendDecks.length >= MIN_LISTS
  /** Copies each zone still has room for (no limit when its rules give none). */
  const room = useMemo(() => {
    const out = new Map<string, number>()
    for (const zone of zones) {
      const max = zone.exactCount ?? zone.maxCount ?? (zone.allowedCounts ? Math.max(...zone.allowedCounts) : undefined)
      const total = (deck.zones[zone.id] ?? []).reduce((n, e) => n + e.quantity, 0)
      out.set(zone.id, max == null ? Infinity : max - total)
    }
    return out
  }, [zones, deck.zones])

  const rows = useMemo((): Row[] => {
    if (!enough) return []
    const cuts = weakestCards(deck, legendDecks, cardsById)
    const taken = new Set<string>()
    const out: Row[] = []
    for (const s of recommendCards(deck, legendDecks, cardsById)) {
      const left = room.get(s.zoneId) ?? 0
      let swap: CutCandidate | null = null
      if (left <= 0) {
        // A full zone: swap out the card the lists like it play least, if they play it less than this one.
        swap = cuts.find((c) => c.zoneId === s.zoneId && !taken.has(c.card.id) && c.score < s.score) ?? null
        if (!swap) continue
        taken.add(swap.card.id)
      }
      const inZone = swap ? (deck.zones[s.zoneId] ?? []).find((e) => e.cardId === swap.card.id)?.quantity ?? 0 : 0
      const copies = swap ? Math.min(s.usualCopies, inZone) : Math.min(s.usualCopies, left)
      if (copies <= 0) continue
      const owned = ownedIndex.get(poolKey(s.card)) ?? 0
      const price = cards ? cheapestPrinting(s.card, cards).price : s.card.price
      out.push({ ...s, copies, owned, cost: price == null ? null : price * Math.max(0, copies - owned), swap })
    }
    const fit = (a: Row, b: Row) => b.score - a.score
    const byOwned = (a: Row, b: Row) => Math.min(b.owned, b.copies) / b.copies - Math.min(a.owned, a.copies) / a.copies || fit(a, b)
    const byCost = (a: Row, b: Row) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || fit(a, b)
    return out.sort(sort === 'owned' ? byOwned : sort === 'budget' ? byCost : fit)
  }, [enough, legendDecks, deck, cardsById, room, ownedIndex, cards, sort])

  const runeZone = zones.find((z) => z.id === 'runes')
  const runes = useMemo(
    () => (enough && runeZone?.exactCount ? suggestRunes(deck, legendDecks, cardsById, runeZone.exactCount) : []),
    [enough, runeZone, deck, legendDecks, cardsById],
  )
  const showRunes = runes.length > 0 && !sameSplit(runes, deck.freeTextZones.runes ?? [])

  if (deck.gameId !== 'riftbound' || !legendCard || deck.locked) return null
  const name = (n: string) => n.replace(/\s*\([^)]*\)$/, '')
  const zoneName = (zoneId: string) => zoneLabel(zones.find((z) => z.id === zoneId)?.label ?? zoneId)
  const swapIn = (row: Row & { swap: CutCandidate }) =>
    void updateDeck((d) => {
      const entries = (d.zones[row.zoneId] ?? []).map((e) => (e.cardId === row.swap.card.id ? { ...e, quantity: e.quantity - row.copies } : e)).filter((e) => e.quantity > 0)
      const at = entries.findIndex((e) => e.cardId === row.card.id)
      const next = at >= 0 ? entries.map((e, i) => (i === at ? { ...e, quantity: e.quantity + row.copies } : e)) : [...entries, { cardId: row.card.id, quantity: row.copies }]
      return { ...d, zones: { ...d.zones, [row.zoneId]: next } }
    }, t.communityLists.suggestSwapUndo(row.swap.card.name, row.card.name))
  const applyRunes = () =>
    void updateDeck((d) => ({ ...d, freeTextZones: { ...d.freeTextZones, runes } }), t.communityLists.suggestRunesUndo)

  const line = (row: Row) => (
    <div key={`${row.zoneId}|${row.card.id}`} className="deck-suggestion" title={t.communityLists.playedInTitle(row.lists, legendDecks!.length, row.usualCopies)}>
      {row.card.imageUrlSmall && <img className="deck-entry-thumb" src={row.card.imageUrlSmall} alt="" loading="lazy" />}
      <span className="deck-entry-name">
        {name(row.card.name)}
        {row.zoneId !== 'main' && row.zoneId !== 'sideboard' && <span className="text-dim"> · {zoneName(row.zoneId)}</span>}
      </span>
      <span className="community-play-rate">{t.communityLists.suggestShare(Math.round(row.score * 100))}</span>
      {tracking && <span className={`deck-suggestion-own ${row.owned >= row.copies ? 'owned' : ''}`}>{t.communityLists.suggestOwn(Math.min(row.owned, row.copies), row.copies)}</span>}
      {row.cost != null && row.cost > 0 && <span className="community-play-rate">{formatPrice(row.cost)}</span>}
      {row.swap ? (
        <button className="btn" aria-label={t.communityLists.suggestSwapLabel(row.copies, row.swap.card.name, row.card.name)} onClick={() => swapIn(row as Row & { swap: CutCandidate })}>
          {t.communityLists.suggestSwap(row.copies, name(row.swap.card.name))}
        </button>
      ) : (
        <button className="btn" aria-label={t.communityLists.suggestAddLabel(row.copies, row.card.name)} onClick={() => void setCardQuantity(row.zoneId, row.card, row.copies)}>
          {t.communityLists.suggestAdd(row.copies)}
        </button>
      )}
    </div>
  )
  const deckRows = rows.filter((r) => r.zoneId !== 'sideboard')
  const sideRows = rows.filter((r) => r.zoneId === 'sideboard')

  return (
    <section className="deck-notes deck-suggestions">
      <div className="deck-notes-head">
        <button className="deck-notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {enough ? t.communityLists.suggestTitle(legendDecks.length) : t.communityLists.suggestHeading} <span className="text-dim">{open ? '▾' : '▸'}</span>
        </button>
        {open && enough && rows.length > 1 && (
          <select value={sort} aria-label={t.communityLists.suggestSort} onChange={(e) => setSort(e.target.value as SuggestionSort)}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t.communityLists.suggestSorts[s]}
              </option>
            ))}
          </select>
        )}
      </div>
      {open &&
        (!lists ? (
          <div className="text-dim">{t.communityLists.loading}</div>
        ) : !enough ? (
          <div className="text-dim">{t.communityLists.vsMetaFew}</div>
        ) : !rows.length && !showRunes ? (
          <div className="text-dim">{t.communityLists.suggestNone}</div>
        ) : (
          <>
            <div className="text-dim deck-suggestions-hint">{t.communityLists.suggestHint}</div>
            {deckRows.map(line)}
            {sideRows.length > 0 && <div className="community-section-title">{zoneName('sideboard')}</div>}
            {sideRows.map(line)}
            {showRunes && (
              <div className="deck-suggestion">
                <span className="deck-entry-name">{t.communityLists.suggestRunes(runes.map((r) => `${r.quantity} ${r.label}`).join(' · '))}</span>
                <button className="btn" onClick={applyRunes}>
                  {t.communityLists.suggestRunesUse}
                </button>
              </div>
            )}
          </>
        ))}
    </section>
  )
}
