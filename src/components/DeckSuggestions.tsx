import { useMemo, useState } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { useCommunityLists } from '../state/communityLists'
import { listsForLegend, recommendCards } from '../shared/communityMeta'
import { codeIndex } from '../shared/riftboundDeckCode'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import type { Deck } from '../shared/types'
import { t, zoneLabel } from '../shared/i18n'

/** Fewer lists than this and the suggestions say so instead of guessing. */
const MIN_LISTS = 5
const OPEN_KEY = 'brewhouse.deckSuggestions.open'

function savedOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 💡 Suggestions, in a Riftbound deck's editor once it has cards: what the recent lists with its
 * Legend play that it doesn't yet, the lists closest to it counting most (communityMeta.ts
 * recommendCards), each a click to add at its usual number of copies. Closed until opened (and
 * remembered), so the lists are only read when wanted; a full zone gets no suggestions.
 */
export function DeckSuggestions({ deck }: { deck: Deck }) {
  const cardsById = useCardsById('riftbound')
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const legendCard = cardsById.get(deck.zones.legend?.[0]?.cardId ?? '')
  const [open, setOpenState] = useState(savedOpen)
  const { lists } = useCommunityLists(open)
  const zones = useMemo(() => rulesForFormat(getAdapter('riftbound'), deck.formatId).zones, [deck.formatId])

  const setOpen = (next: boolean) => {
    setOpenState(next)
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0')
    } catch {
      // not remembered, that's all
    }
  }

  const legendDecks = useMemo(
    () => (open && lists && legendCard ? listsForLegend(lists, legendCard, codeIndex(cardsById.values())) : null),
    [open, lists, legendCard, cardsById],
  )
  /** Copies each zone still has room for (no limit when its rules give none). */
  const room = useMemo(() => {
    const out = new Map<string, number>()
    for (const zone of zones) {
      const max = zone.exactCount ?? zone.maxCount
      const total = (deck.zones[zone.id] ?? []).reduce((n, e) => n + e.quantity, 0)
      out.set(zone.id, max == null ? Infinity : max - total)
    }
    return out
  }, [zones, deck.zones])
  const suggestions = useMemo(
    () => (legendDecks && legendDecks.length >= MIN_LISTS ? recommendCards(deck, legendDecks, cardsById).filter((s) => (room.get(s.zoneId) ?? 0) > 0) : []),
    [legendDecks, deck, cardsById, room],
  )

  if (deck.gameId !== 'riftbound' || !legendCard || deck.locked) return null
  const name = (n: string) => n.replace(/\s*\([^)]*\)$/, '')
  const zoneName = (zoneId: string) => zoneLabel(zones.find((z) => z.id === zoneId)?.label ?? zoneId)

  return (
    <section className="deck-notes deck-suggestions">
      <div className="deck-notes-head">
        <button className="deck-notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {legendDecks && legendDecks.length >= MIN_LISTS ? t.communityLists.suggestTitle(legendDecks.length) : t.communityLists.suggestHeading}{' '}
          <span className="text-dim">{open ? '▾' : '▸'}</span>
        </button>
      </div>
      {open &&
        (!lists ? (
          <div className="text-dim">{t.communityLists.loading}</div>
        ) : !legendDecks || legendDecks.length < MIN_LISTS ? (
          <div className="text-dim">{t.communityLists.vsMetaFew}</div>
        ) : !suggestions.length ? (
          <div className="text-dim">{t.communityLists.suggestNone}</div>
        ) : (
          <>
            <div className="text-dim deck-suggestions-hint">{t.communityLists.suggestHint}</div>
            {suggestions.map((s) => {
              const copies = Math.min(s.usualCopies, room.get(s.zoneId) ?? 0)
              return (
                <div key={s.card.id} className="deck-suggestion" title={t.communityLists.playedInTitle(s.lists, legendDecks.length, s.usualCopies)}>
                  {s.card.imageUrlSmall && <img className="deck-entry-thumb" src={s.card.imageUrlSmall} alt="" loading="lazy" />}
                  <span className="deck-entry-name">
                    {name(s.card.name)}
                    {s.zoneId !== 'main' && <span className="text-dim"> · {zoneName(s.zoneId)}</span>}
                  </span>
                  <span className="community-play-rate">{t.communityLists.suggestShare(Math.round(s.score * 100))}</span>
                  <button className="btn" aria-label={t.communityLists.suggestAddLabel(copies, s.card.name)} onClick={() => void setCardQuantity(s.zoneId, s.card, copies)}>
                    {t.communityLists.suggestAdd(copies)}
                  </button>
                </div>
              )
            })}
          </>
        ))}
    </section>
  )
}
