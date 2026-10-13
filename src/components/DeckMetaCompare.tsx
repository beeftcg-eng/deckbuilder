import { useMemo, useState } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { useCommunityLists } from '../state/communityLists'
import { compareToMeta, listDeck, type ListDeck } from '../shared/communityMeta'
import { cardForCode, codeIndex } from '../shared/riftboundDeckCode'
import { poolKey } from '../shared/collection'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'

/** Fewer lists than this and the comparison says so instead of guessing. */
const MIN_LISTS = 5

/**
 * 📈 Against the meta, in a Riftbound deck's view: the cards most recent lists with its Legend play
 * that it doesn't, and its picks few of them make (communityMeta.ts compareToMeta). Closed until
 * opened, so the lists are only read when wanted. Also where to opt in to hearing about new lists
 * with that Legend.
 */
export function DeckMetaCompare({ deck }: { deck: Deck }) {
  const cardsById = useCardsById('riftbound')
  const legendCard = cardsById.get(deck.zones.legend?.[0]?.cardId ?? '')
  const [open, setOpen] = useState(false)
  const { lists } = useCommunityLists(open)
  const legendCode = useMemo(() => {
    if (!legendCard || !lists) return null
    const index = codeIndex(cardsById.values())
    const key = poolKey(legendCard)
    return lists.find((l) => {
      const card = cardForCode(index, l.legendId)
      return card && poolKey(card) === key
    })?.legendId ?? null
  }, [legendCard, lists, cardsById])
  const alerted = useAppStore((s) => (legendCode ? (s.settings.listAlerts?.legends ?? []).includes(legendCode) : false))
  const setLegendAlert = useAppStore((s) => s.setLegendAlert)

  const comparison = useMemo(() => {
    if (!open || !lists || !legendCode) return null
    const index = codeIndex(cardsById.values())
    const decks = lists.filter((l) => l.legendId === legendCode).flatMap((l): ListDeck[] => {
      const d = listDeck(l, index)
      return d ? [d] : []
    })
    return compareToMeta(deck, decks, cardsById)
  }, [open, lists, legendCode, deck, cardsById])

  if (deck.gameId !== 'riftbound' || !legendCard) return null
  const name = (n: string) => n.replace(/\s*\([^)]*\)$/, '')

  return (
    <section className="deck-notes deck-meta">
      <div className="deck-notes-head">
        <button className="deck-notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {comparison ? t.communityLists.vsMetaTitle(comparison.total) : t.communityLists.vsMetaHeading} <span className="text-dim">{open ? '▾' : '▸'}</span>
        </button>
        {open && legendCode && (
          <button className={`btn community-alert ${alerted ? 'on' : ''}`} aria-pressed={alerted} title={t.communityLists.alertTitle} onClick={() => setLegendAlert(legendCode, !alerted)}>
            {alerted ? t.communityLists.alertOn : t.communityLists.alertOff}
          </button>
        )}
      </div>
      {open &&
        (!lists ? (
          <div className="text-dim">{t.communityLists.loading}</div>
        ) : !comparison || comparison.total < MIN_LISTS ? (
          <div className="text-dim">{t.communityLists.vsMetaFew}</div>
        ) : !comparison.missing.length && !comparison.unusual.length ? (
          <div className="text-dim">{t.communityLists.vsMetaNone}</div>
        ) : (
          <div className="deck-meta-columns">
            {comparison.missing.length > 0 && (
              <div>
                <div className="community-section-title">{t.communityLists.vsMetaMissing}</div>
                {comparison.missing.map((p) => (
                  <div key={p.card.id} className="deck-meta-line" title={t.communityLists.playedInTitle(p.lists, comparison.total, p.usualCopies)}>
                    <span className="community-count">{p.usualCopies}</span> {name(p.card.name)} <span className="text-dim">{t.communityLists.vsMetaShare(p.lists, comparison.total)}</span>
                  </div>
                ))}
              </div>
            )}
            {comparison.unusual.length > 0 && (
              <div>
                <div className="community-section-title">{t.communityLists.vsMetaUnusual}</div>
                {comparison.unusual.map((u) => (
                  <div key={u.card.id} className="deck-meta-line">
                    {name(u.card.name)} <span className="text-dim">{t.communityLists.vsMetaShare(u.lists, comparison.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </section>
  )
}
