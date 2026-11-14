import { useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { compareToMeta } from '../shared/communityMeta'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'
import { useDeckLists } from './community/useDeckLists'
import { PracticeRecord } from './practice/PracticeRecord'
import { recordsFor } from '../shared/practice/results'

/** Fewer lists than this and the comparison says so instead of guessing. */
const MIN_LISTS = 5

/**
 * 📈 Against the meta, in a deck's view (Riftbound, One Piece, Pokémon): the cards most recent lists
 * like it play that it doesn't, and its picks few of them make (communityMeta.ts compareToMeta).
 * Closed until opened, so the lists are only read when wanted. Also where to opt in to hearing about
 * new lists of that kind.
 */
export function DeckMetaCompare({ deck }: { deck: Deck }) {
  const [open, setOpen] = useState(false)
  const { supported, gameId, game, cardsById, lists, archetype: legendCode, decks, identityCard } = useDeckLists(deck, open)
  const alerted = useAppStore((s) => (legendCode ? (s.settings.listAlerts?.legends ?? []).includes(legendCode) : false))
  const setLegendAlert = useAppStore((s) => s.setLegendAlert)
  const practiceResults = useAppStore((s) => s.settings.practiceResults)
  const practice = useMemo(() => recordsFor(practiceResults, deck.id), [practiceResults, deck.id])

  const comparison = useMemo(() => (open && lists && legendCode ? compareToMeta(deck, decks, cardsById) : null), [open, lists, legendCode, deck, decks, cardsById])

  if (!supported || (game.identityZone && !identityCard)) return null
  const name = (n: string) => n.replace(/\s*\([^)]*\)$/, '')

  return (
    <section className="deck-notes deck-meta">
      <div className="deck-notes-head">
        <button className="deck-notes-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {comparison ? t.communityLists.vsMetaTitle(comparison.total) : t.communityLists.vsMetaHeading} <span className="text-dim">{open ? '▾' : '▸'}</span>
        </button>
        {open && legendCode && (
          <button className={`btn community-alert ${alerted ? 'on' : ''}`} aria-pressed={alerted} title={t.communityLists.alertTitle(gameId)} onClick={() => setLegendAlert(legendCode, !alerted)}>
            {alerted ? t.communityLists.alertOn : t.communityLists.alertOff}
          </button>
        )}
      </div>
      {open &&
        (!lists ? (
          <div className="text-dim">{t.communityLists.loading}</div>
        ) : !comparison || comparison.total < MIN_LISTS ? (
          <div className="text-dim">{t.communityLists.vsMetaFew(gameId)}</div>
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
      {open && practice.length > 0 && <PracticeRecord records={practice} />}
    </section>
  )
}
