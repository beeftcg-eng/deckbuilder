import { useMemo } from 'react'
import type { CommunityList } from '../../shared/communityLists'
import { legendMeta, localMeta } from '../../shared/communityMeta'
import { cardForCode } from '../../shared/riftboundDeckCode'
import type { Card, PairingsResult } from '../../shared/types'
import { t } from '../../shared/i18n'
import { DomainPips, LegendArt, LegendWash, VsChip } from './communityUi'
import { legendLook } from './communityHelpers'

/**
 * Your events: the Legends you actually face, from the opponents in your Pairings results with your
 * Riftbound decks (communityMeta.ts localMeta), most played first, each opening its Meta page. What
 * the online meta can't tell you: your own store's field.
 */
export function CommunityEventsView({
  lists,
  results,
  index,
  onLegend,
}: {
  lists: CommunityList[]
  results: PairingsResult[]
  index: Map<string, Card>
  onLegend: (legendId: string) => void
}) {
  const local = useMemo(() => localMeta(legendMeta(lists), results), [lists, results])
  if (!local.games) return <p className="community-meta-intro text-dim">{t.communityLists.eventsNone}</p>
  const top = local.legends[0]?.games ?? 1
  return (
    <div className="community-scroll">
      <p className="community-meta-intro text-dim">{t.communityLists.eventsIntro(local.games)}</p>
      <ul className="community-list">
        {local.legends.map((row) => {
          const card = cardForCode(index, row.legendId)
          const { domains, style } = legendLook(card)
          return (
            <li key={row.legendId} className="community-entry" style={style}>
              <LegendWash card={card} />
              <button className="community-row" onClick={() => onLegend(row.legendId)}>
                <LegendArt card={card} name={row.legendName} />
                <span className="community-main">
                  <span className="community-legend-name">{row.legendName}</span>
                  <span className="community-meta-bar" aria-hidden>
                    <span style={{ width: `${(row.games / top) * 100}%` }} />
                  </span>
                  <span className="community-player">
                    {t.communityLists.games(row.games)} <VsChip record={row} />
                  </span>
                </span>
                <DomainPips domains={domains} />
                <span className="community-chevron" aria-hidden>
                  ›
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {local.other.length > 0 && (
        <section className="community-other">
          <div className="community-section-title">{t.communityLists.eventsOther}</div>
          <p className="text-dim">{t.communityLists.eventsOtherHint}</p>
          <ul className="community-trade-list">
            {local.other.map((m) => (
              <li key={m.opponent}>
                {m.opponent} <span className="text-dim">· {t.communityLists.games(m.games)}</span> <VsChip record={m} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
