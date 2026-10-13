import { useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, useCardsById, useOwnedIndex } from '../state/useAppStore'
import { useCommunityLists } from '../state/communityLists'
import { COMMUNITY_LISTS_URL, type CommunityList } from '../shared/communityLists'
import { cardPlayRates, coreDeck, legendMeta, listDeck, listOwnership, type ListDeck } from '../shared/communityMeta'
import { cardForCode, codeIndex, deckCodeToText } from '../shared/riftboundDeckCode'
import { formatPrice } from '../shared/collection'
import { getAdapter } from '../shared/games/registry'
import type { Card } from '../shared/types'
import { t, zoneLabel } from '../shared/i18n'
import { Rich } from './Rich'
import { DOMAIN_COLORS } from '../lib/domainColors'

const PAGE = 40

/** The decklist text's headings, as the deck's zone names. */
const SECTION_ZONES: Record<string, string> = { Legend: 'Legend', MainDeck: 'Main Deck', Battlefields: 'Battlefields', Runes: 'Rune Deck', Sideboard: 'Sideboard' }
const ZONE_LABELS: Record<string, string> = { main: 'Main Deck', battlefields: 'Battlefields', sideboard: 'Sideboard' }

/** "3 ogn-066-298 Ahri, Alluring" as "3 Ahri, Alluring", for the preview. */
const withoutSourceId = (line: string) => line.replace(/^(\d+) [a-z]+-[^\s]+ /, '$1 ')

/** The decklist text as headed sections of [count, name]. */
function sections(text: string): { heading: string; cards: [string, string][] }[] {
  return text.split('\n\n').map((block) => {
    const [heading, ...lines] = block.split('\n')
    return {
      heading: zoneLabel(SECTION_ZONES[heading.replace(/:$/, '')] ?? heading.replace(/:$/, '')),
      cards: lines.map((line) => {
        const m = /^(\d+) (.*)$/.exec(withoutSourceId(line))
        return m ? [m[1], m[2]] : ['', line]
      }),
    }
  })
}

const medal = (rank: number | null) => (rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank != null && rank <= 4 ? 'bronze' : '')

/** A Legend's colors and art, for a row's accent and medallion. */
function legendLook(card: Card | undefined): { domains: string[]; style: CSSProperties } {
  const domains = card?.colors.filter((d) => DOMAIN_COLORS[d]) ?? []
  const a = DOMAIN_COLORS[domains[0]] ?? 'var(--accent)'
  return { domains, style: { '--domain-a': a, '--domain-b': DOMAIN_COLORS[domains[1]] ?? a } as CSSProperties }
}

function LegendArt({ card, name }: { card: Card | undefined; name: string }) {
  return <span className="community-legend-art">{card?.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <span>{name.slice(0, 1)}</span>}</span>
}

function DomainPips({ domains }: { domains: string[] }) {
  if (!domains.length) return null
  return (
    <span className="community-domains" aria-label={domains.join(', ')}>
      {domains.map((d) => (
        <span key={d} className="community-domain" style={{ background: DOMAIN_COLORS[d] }} title={d} />
      ))}
    </span>
  )
}

const nameFor = (list: CommunityList) =>
  [list.legendName, [list.player, list.rank != null ? t.communityLists.place(list.rank) : null].filter(Boolean).join(' ')].filter(Boolean).join(' – ')

type Tab = 'lists' | 'meta'

/**
 * Recent Riftbound tournament lists from RiftAtlas (shared/communityLists.ts). **Lists**: by event, each
 * with its Legend's art and how much of it you own; opening one shows its cards, and Import, Compare
 * (with one of your decks) or Copy. **Meta**: how often each Legend places, which cards its lists play,
 * and a deck started from the cards most of them agree on (shared/communityMeta.ts).
 */
export function CommunityListsModal({
  onImport,
  onCompare,
  onClose,
}: {
  onImport: (text: string, name: string) => void
  onCompare: (deckId: string, text: string, name: string) => void
  onClose: () => void
}) {
  const cardsById = useCardsById('riftbound')
  const cards = useAppStore((s) => s.catalogs.riftbound?.cards)
  const owned = useOwnedIndex()
  const myDecks = useAppStore((s) => s.decks)
  const index = useMemo(() => codeIndex(cardsById.values()), [cardsById])
  const { lists, error, retry } = useCommunityLists(cardsById.size > 0)
  const [tab, setTab] = useState<Tab>('lists')
  const [legend, setLegend] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [comparingId, setComparingId] = useState<string | null>(null)

  const decks = useMemo(() => {
    const out = new Map<string, ListDeck>()
    for (const l of lists ?? []) {
      const deck = listDeck(l, cardsById)
      if (deck) out.set(l.id, deck)
    }
    return out
  }, [lists, cardsById])
  const ownership = useMemo(
    () => new Map([...decks].map(([id, deck]) => [id, listOwnership(deck, cardsById, cards ?? [], owned)])),
    [decks, cardsById, cards, owned],
  )
  const riftboundDecks = useMemo(() => myDecks.filter((d) => d.gameId === 'riftbound').sort((a, b) => a.name.localeCompare(b.name)), [myDecks])

  const legends = useMemo(() => legendMeta(lists ?? []), [lists])
  const filtered = useMemo(() => (lists ?? []).filter((l) => !legend || l.legendId === legend), [lists, legend])
  // The lists come newest event first, so an event's finishes are next to each other.
  const events = useMemo(() => {
    const out: { key: string; lists: CommunityList[] }[] = []
    for (const list of filtered.slice(0, shown)) {
      const key = `${list.eventName}|${list.date ?? ''}`
      if (out.at(-1)?.key === key) out.at(-1)!.lists.push(list)
      else out.push({ key, lists: [list] })
    }
    return out
  }, [filtered, shown])

  const textFor = (list: CommunityList): string | null => {
    try {
      return deckCodeToText(list.deckCode, cardsById.values())
    } catch {
      return null
    }
  }

  async function copy(list: CommunityList, text: string) {
    await window.api.clipboard.writeText(text)
    setCopiedId(list.id)
    setTimeout(() => setCopiedId((id) => (id === list.id ? null : id)), 1500)
  }

  async function startFromCore(legendId: string, legendName: string) {
    const core = coreDeck([...decks.values()].filter((d) => d.list.legendId === legendId), cardsById)
    const matchedCopies = Object.values(core.zones).reduce((n, entries) => n + entries.reduce((m, e) => m + e.quantity, 0), 0)
    await useAppStore.getState().importDeck('riftbound', { ...core, name: null, formatLabel: null, unmatched: [], matchedCopies }, t.communityLists.coreName(legendName), 'constructed')
    onClose()
  }

  const ownershipChip = (list: CommunityList) => {
    const o = ownership.get(list.id)
    if (!o || !o.needed) return null
    if (o.owned >= o.needed) return <span className="community-own complete">{t.communityLists.ownAll}</span>
    return (
      <span className="community-own">
        {t.communityLists.own(o.owned, o.needed)}
        {o.missingCost > 0 && <> · {t.communityLists.toFinish(formatPrice(o.missingCost))}</>}
      </span>
    )
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal community-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.communityLists.title}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <div className="community-source text-dim">
          <span>
            <Rich text={t.communityLists.source} />
          </span>
          <button className="btn" onClick={() => void window.api.system.openExternal(COMMUNITY_LISTS_URL)}>
            {t.communityLists.openSource}
          </button>
        </div>

        {cardsById.size === 0 ? (
          <div className="text-dim">{t.importDeck.noData(getAdapter('riftbound').shortName)}</div>
        ) : error ? (
          <div className="community-error">
            <span className="sync-error">{error}</span>
            <button className="btn" onClick={retry}>
              {t.communityLists.retry}
            </button>
          </div>
        ) : !lists ? (
          <div className="text-dim">{t.communityLists.loading}</div>
        ) : lists.length === 0 ? (
          <div className="text-dim">{t.communityLists.empty}</div>
        ) : (
          <>
            <div className="community-toolbar">
              <div className="compare-source" role="tablist">
                {(['lists', 'meta'] as const).map((id) => (
                  <button key={id} role="tab" aria-selected={tab === id} className={`btn ${tab === id ? 'btn-primary' : ''}`} onClick={() => setTab(id)}>
                    {id === 'lists' ? t.communityLists.tabLists : t.communityLists.tabMeta}
                  </button>
                ))}
              </div>
              {tab === 'lists' && (
                <select
                  value={legend}
                  aria-label={t.communityLists.legend}
                  onChange={(e) => {
                    setLegend(e.target.value)
                    setShown(PAGE)
                    setOpenId(null)
                  }}
                >
                  <option value="">{t.communityLists.allLegends(lists.length)}</option>
                  {legends.map((m) => (
                    <option key={m.legendId} value={m.legendId}>
                      {m.legendName} ({m.lists})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {tab === 'meta' ? (
              <MetaView
                lists={lists}
                decks={decks}
                cardsById={cardsById}
                index={index}
                legend={legend}
                onLegend={setLegend}
                onImportNewest={(list) => {
                  const text = textFor(list)
                  if (text) onImport(text, nameFor(list))
                }}
                onStartFromCore={(id, name) => void startFromCore(id, name)}
              />
            ) : (
              <div className="community-scroll">
                {events.map((event) => {
                  const first = event.lists[0]
                  return (
                    <section key={event.key} className="community-event-group">
                      <header className="community-event-header">
                        <span className="community-event-name">{first.eventName}</span>
                        <span className="community-event-meta">
                          {[first.players != null ? t.communityLists.players(first.players) : null, first.date ? new Date(first.date).toLocaleDateString() : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </header>
                      <ul className="community-list">
                        {event.lists.map((list) => {
                          const open = openId === list.id
                          const text = open ? textFor(list) : null
                          const card = cardForCode(index, list.legendId)
                          const { domains, style } = legendLook(card)
                          return (
                            <li key={list.id} className={`community-entry ${open ? 'open' : ''}`} style={style}>
                              {card?.imageUrl && <img className="community-wash" src={card.imageUrl} alt="" loading="lazy" aria-hidden />}
                              <button className="community-row" aria-expanded={open} onClick={() => setOpenId(open ? null : list.id)}>
                                <span className={`community-rank ${medal(list.rank)}`}>{list.rank ?? '–'}</span>
                                <LegendArt card={card} name={list.legendName} />
                                <span className="community-main">
                                  <span className="community-legend-name">{list.legendName}</span>
                                  {list.player && <span className="community-player">{t.communityLists.by(list.player)}</span>}
                                  {ownershipChip(list)}
                                </span>
                                <DomainPips domains={domains} />
                                <span className="community-chevron" aria-hidden>
                                  ▾
                                </span>
                              </button>
                              {open &&
                                (text ? (
                                  <div className="community-detail">
                                    <div className="community-sections">
                                      {sections(text).map((s) => (
                                        <div key={s.heading} className="community-section">
                                          <div className="community-section-title">
                                            {s.heading} <span>{s.cards.reduce((n, [c]) => n + (Number(c) || 0), 0)}</span>
                                          </div>
                                          {s.cards.map(([count, name], i) => (
                                            <div key={i} className="community-card-line">
                                              <span className="community-count">{count}</span> {name}
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="community-actions">
                                      <button className="btn btn-primary" onClick={() => onImport(text, nameFor(list))}>
                                        {t.communityLists.import}
                                      </button>
                                      {comparingId === list.id ? (
                                        riftboundDecks.length ? (
                                          <select
                                            autoFocus
                                            defaultValue=""
                                            aria-label={t.communityLists.compareWith}
                                            onChange={(e) => e.target.value && onCompare(e.target.value, text, nameFor(list))}
                                          >
                                            <option value="" disabled>
                                              {t.communityLists.compareWith}
                                            </option>
                                            {riftboundDecks.map((d) => (
                                              <option key={d.id} value={d.id}>
                                                {d.name}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="text-dim">{t.communityLists.noDecks}</span>
                                        )
                                      ) : (
                                        <button className="btn" onClick={() => setComparingId(list.id)}>
                                          {t.communityLists.compare}
                                        </button>
                                      )}
                                      <button className="btn" onClick={() => void copy(list, text)}>
                                        {copiedId === list.id ? t.communityLists.copied : t.communityLists.copy}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="sync-error community-detail">{t.communityLists.badCode}</div>
                                ))}
                            </li>
                          )
                        })}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
            {tab === 'lists' && filtered.length > shown && (
              <button className="btn" onClick={() => setShown((n) => n + PAGE)}>
                {t.communityLists.showMore(Math.min(PAGE, filtered.length - shown))}
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** The Meta tab: Legends by how often they place, then one Legend's card choices. */
function MetaView({
  lists,
  decks,
  cardsById,
  index,
  legend,
  onLegend,
  onImportNewest,
  onStartFromCore,
}: {
  lists: CommunityList[]
  decks: Map<string, ListDeck>
  cardsById: Map<string, Card>
  index: Map<string, Card>
  legend: string
  onLegend: (legendId: string) => void
  onImportNewest: (list: CommunityList) => void
  onStartFromCore: (legendId: string, legendName: string) => void
}) {
  const meta = useMemo(() => legendMeta(lists), [lists])
  const top = meta[0]?.lists ?? 1
  const selected = meta.find((m) => m.legendId === legend)
  const legendDecks = useMemo(() => [...decks.values()].filter((d) => d.list.legendId === legend), [decks, legend])
  const plays = useMemo(() => cardPlayRates(legendDecks, cardsById), [legendDecks, cardsById])

  if (!selected) {
    return (
      <div className="community-scroll">
        <p className="community-meta-intro text-dim">{t.communityLists.metaIntro(lists.length)}</p>
        <ul className="community-list">
          {meta.map((m) => {
            const card = cardForCode(index, m.legendId)
            const { domains, style } = legendLook(card)
            return (
              <li key={m.legendId} className="community-entry" style={style}>
                {card?.imageUrl && <img className="community-wash" src={card.imageUrl} alt="" loading="lazy" aria-hidden />}
                <button className="community-row" onClick={() => onLegend(m.legendId)}>
                  <LegendArt card={card} name={m.legendName} />
                  <span className="community-main">
                    <span className="community-legend-name">{m.legendName}</span>
                    <span className="community-meta-bar" aria-hidden>
                      <span style={{ width: `${(m.lists / top) * 100}%` }} />
                    </span>
                    <span className="community-player">
                      {[t.communityLists.metaLists(m.lists), m.wins ? t.communityLists.metaWins(m.wins) : null, m.top4 ? t.communityLists.metaTop4(m.top4) : null].filter(Boolean).join(' · ')}
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

  const card = cardForCode(index, selected.legendId)
  const { domains, style } = legendLook(card)
  const newest = legendDecks[0]?.list
  const total = legendDecks.length
  const byZone = (['main', 'battlefields', 'sideboard'] as const).map((zoneId) => ({ zoneId, plays: plays.filter((p) => p.zoneId === zoneId) })).filter((z) => z.plays.length)

  return (
    <div className="community-scroll">
      <button className="btn community-back" onClick={() => onLegend('')}>
        {t.communityLists.back}
      </button>
      <div className="community-entry community-meta-head" style={style}>
        {card?.imageUrl && <img className="community-wash" src={card.imageUrl} alt="" loading="lazy" aria-hidden />}
        <div className="community-row">
          <LegendArt card={card} name={selected.legendName} />
          <span className="community-main">
            <span className="community-legend-name">{selected.legendName}</span>
            <span className="community-player">
              {[t.communityLists.metaLists(selected.lists), selected.wins ? t.communityLists.metaWins(selected.wins) : null, selected.top4 ? t.communityLists.metaTop4(selected.top4) : null]
                .filter(Boolean)
                .join(' · ')}
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
            <button className="btn btn-primary" title={t.communityLists.coreTitle} onClick={() => onStartFromCore(selected.legendId, selected.legendName)}>
              {t.communityLists.startFromCore}
            </button>
          )}
        </div>
      </div>
      <div className="community-sections community-plays" style={style}>
        {byZone.map(({ zoneId, plays: zonePlays }) => (
          <div key={zoneId} className="community-section">
            <div className="community-section-title">{zoneLabel(ZONE_LABELS[zoneId])}</div>
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
