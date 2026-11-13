import { useMemo } from 'react'
import type { CommunityList } from '../../shared/communityLists'
import { TREND_DAYS, cardPlayRates, cardTrends, legendMeta, type CardTrend, type ListDeck, type VsRecord } from '../../shared/communityMeta'
import { useAppStore } from '../../state/useAppStore'
import { communityGame, type CommunityGameId } from '../../shared/communityGames'
import { getAdapter } from '../../shared/games/registry'
import type { Card } from '../../shared/types'
import { t, zoneLabel } from '../../shared/i18n'
import { DomainPips, LegendArt, LegendWash, VsChip } from './communityUi'
import { legendLook } from './communityHelpers'

interface Props {
  gameId: CommunityGameId
  lists: CommunityList[]
  decks: Map<string, ListDeck>
  cardsById: Map<string, Card>
  index: Map<string, Card>
  /** Your record against each Legend, from Pairings. */
  records: Map<string, VsRecord>
  legend: string
  onLegend: (legendId: string) => void
  onImportNewest: (list: CommunityList) => void
  onStartFromCore: (legendId: string, legendName: string) => void
}

/** The Meta tab: Legends by how often they place (and how you do against them), then one Legend's card choices. */
export function CommunityMetaView({ gameId, lists, decks, cardsById, index, records, legend, onLegend, onImportNewest, onStartFromCore }: Props) {
  const game = communityGame(gameId)
  const meta = useMemo(() => legendMeta(lists), [lists])
  /** An archetype's picture: from its first list (they share a Legend or Leader; Pokémon's main attacker). */
  const artFor = (legendId: string) => {
    const list = lists.find((l) => l.legendId === legendId && (l.art || gameId === 'riftbound'))
    return list ? game.artCard(index, list) : undefined
  }
  // The zones the lists' cards go in, in the game's order (the Legend or Leader aside).
  const zoneLabels = useMemo(() => new Map(getAdapter(gameId).deckRules.zones.filter((z) => !z.freeText && z.id !== communityGame(gameId).identityZone).map((z) => [z.id, z.label])), [gameId])
  const selected = meta.find((m) => m.legendId === legend)
  const legendDecks = useMemo(() => [...decks.values()].filter((d) => d.list.legendId === legend), [decks, legend])
  const plays = useMemo(() => cardPlayRates(legendDecks, cardsById), [legendDecks, cardsById])
  const trends = useMemo(() => cardTrends(legendDecks, cardsById), [legendDecks, cardsById])
  const alerted = useAppStore((s) => (s.settings.listAlerts?.legends ?? []).includes(legend))
  const setLegendAlert = useAppStore((s) => s.setLegendAlert)
  const stats = (m: (typeof meta)[number]) =>
    [t.communityLists.metaLists(m.lists), m.wins ? t.communityLists.metaWins(m.wins) : null, m.top4 ? t.communityLists.metaTop4(m.top4) : null].filter(Boolean).join(' · ')

  if (!selected) {
    const top = meta[0]?.lists ?? 1
    return (
      <div className="community-scroll">
        <p className="community-meta-intro text-dim">{t.communityLists.metaIntro(gameId, lists.length)}</p>
        <ul className="community-list">
          {meta.map((m) => {
            const card = artFor(m.legendId)
            const { domains, style } = legendLook(card)
            return (
              <li key={m.legendId} className="community-entry" style={style}>
                <LegendWash card={card} />
                <button className="community-row" onClick={() => onLegend(m.legendId)}>
                  <LegendArt card={card} name={m.legendName} />
                  <span className="community-main">
                    <span className="community-legend-name">{m.legendName}</span>
                    <span className="community-meta-bar" aria-hidden>
                      <span style={{ width: `${(m.lists / top) * 100}%` }} />
                    </span>
                    <span className="community-player">
                      {stats(m)} <VsChip record={records.get(m.legendId)} />
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
      </div>
    )
  }

  const card = artFor(selected.legendId)
  const { domains, style } = legendLook(card)
  const newest = legendDecks[0]?.list
  const total = legendDecks.length
  const byZone = [...zoneLabels.keys()].map((zoneId) => ({ zoneId, plays: plays.filter((p) => p.zoneId === zoneId) })).filter((z) => z.plays.length)

  return (
    <div className="community-scroll">
      <button className="btn community-back" onClick={() => onLegend('')}>
        {t.communityLists.back(gameId)}
      </button>
      <div className="community-entry community-meta-head" style={style}>
        <LegendWash card={card} />
        <div className="community-row">
          <LegendArt card={card} name={selected.legendName} />
          <span className="community-main">
            <span className="community-legend-name">{selected.legendName}</span>
            <span className="community-player">
              {stats(selected)} <VsChip record={records.get(selected.legendId)} />
            </span>
          </span>
          <DomainPips domains={domains} />
        </div>
        <div className="community-actions community-meta-actions">
          {newest && (
            <button className="btn" onClick={() => onImportNewest(newest)}>
              {t.communityLists.newestList}
            </button>
          )}
          {total > 0 && (
            <button className="btn btn-primary" title={t.communityLists.coreTitle(gameId)} onClick={() => onStartFromCore(selected.legendId, selected.legendName)}>
              {t.communityLists.startFromCore}
            </button>
          )}
          <button
            className={`btn community-alert ${alerted ? 'on' : ''}`}
            aria-pressed={alerted}
            title={t.communityLists.alertTitle(gameId)}
            onClick={() => setLegendAlert(selected.legendId, !alerted)}
          >
            {alerted ? t.communityLists.alertOn : t.communityLists.alertOff}
          </button>
        </div>
      </div>
      {trends && (trends.rising.length > 0 || trends.falling.length > 0) && (
        <div className="community-sections community-trends" style={style}>
          <TrendColumn title={`${t.communityLists.rising} · ${t.communityLists.trendsTitle(TREND_DAYS)}`} trends={trends.rising} up />
          <TrendColumn title={`${t.communityLists.falling} · ${t.communityLists.trendsTitle(TREND_DAYS)}`} trends={trends.falling} />
        </div>
      )}
      <div className="community-sections community-plays" style={style}>
        {byZone.map(({ zoneId, plays: zonePlays }) => (
          <div key={zoneId} className="community-section">
            <div className="community-section-title">{zoneLabel(zoneLabels.get(zoneId) ?? zoneId)}</div>
            {zonePlays.map((p) => (
              <div key={p.card.id} className="community-play" title={t.communityLists.playedInTitle(p.lists, total, p.usualCopies)}>
                <span className="community-play-bar" style={{ width: `${(p.lists / total) * 100}%` }} aria-hidden />
                <span className="community-count">{p.usualCopies}</span>
                <span className="community-play-name">{p.card.name.replace(/\s*\([^)]*\)$/, '')}</span>
                <span className="community-play-rate">{t.communityLists.playedIn(p.lists, total)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function TrendColumn({ title, trends, up }: { title: string; trends: CardTrend[]; up?: boolean }) {
  if (!trends.length) return null
  return (
    <div className="community-section">
      <div className="community-section-title">{title}</div>
      {trends.map((tr) => (
        <div key={tr.card.id} className={`community-trend ${up ? 'up' : 'down'}`}>
          <span aria-hidden>{up ? '▲' : '▼'}</span>
          <span className="community-play-name">{tr.card.name.replace(/\s*\([^)]*\)$/, '')}</span>
          <span className="community-play-rate">{t.communityLists.trend(Math.round(tr.recent * 100), Math.round(tr.earlier * 100))}</span>
        </div>
      ))}
    </div>
  )
}
