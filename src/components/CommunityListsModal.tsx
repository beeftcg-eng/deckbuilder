import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useCardsById } from '../state/useAppStore'
import { COMMUNITY_LISTS_URL, fromRiftAtlas, type CommunityList } from '../shared/communityLists'
import { cardForCode, codeIndex, deckCodeToText } from '../shared/riftboundDeckCode'
import { getAdapter } from '../shared/games/registry'
import { t, zoneLabel } from '../shared/i18n'
import { Rich } from './Rich'

const PAGE = 40
/** The page changes when a new event is added, so one read lasts a while. */
const CACHE_MS = 30 * 60 * 1000
let cache: { at: number; lists: CommunityList[] } | null = null

/** Each Riftbound domain's color, for the Legend's pips and the row's accent. */
const DOMAIN_COLORS: Record<string, string> = {
  Fury: '#e5484d',
  Calm: '#46a758',
  Mind: '#3e9bdc',
  Body: '#f08c2e',
  Chaos: '#9b5de5',
  Order: '#e2b23c',
}

/** The decklist text's headings, as the deck's zone names. */
const SECTION_ZONES: Record<string, string> = { Legend: 'Legend', MainDeck: 'Main Deck', Battlefields: 'Battlefields', Runes: 'Rune Deck', Sideboard: 'Sideboard' }

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

/**
 * Recent Riftbound tournament lists from RiftAtlas (shared/communityLists.ts), by event, each with its
 * Legend's art. Opening one shows its cards; Import hands it to the import window (`onImport`), and Copy
 * puts the list on the clipboard for Compare's paste box or anywhere else.
 */
export function CommunityListsModal({ onImport, onClose }: { onImport: (text: string, name: string) => void; onClose: () => void }) {
  const cardsById = useCardsById('riftbound')
  const index = useMemo(() => codeIndex(cardsById.values()), [cardsById])
  const [lists, setLists] = useState<CommunityList[] | null>(() => (cache && Date.now() - cache.at < CACHE_MS ? cache.lists : null))
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [legend, setLegend] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (lists) return
    let cancelled = false
    window.api
      .fetchCommunityLists()
      .then((html) => {
        const read = fromRiftAtlas(html)
        cache = { at: Date.now(), lists: read }
        if (!cancelled) setLists(read)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [lists, attempt])

  const legends = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>()
    for (const l of lists ?? []) counts.set(l.legendId, { name: l.legendName, n: (counts.get(l.legendId)?.n ?? 0) + 1 })
    return [...counts].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name))
  }, [lists])
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
  const nameFor = (list: CommunityList) =>
    [list.legendName, [list.player, list.rank != null ? t.communityLists.place(list.rank) : null].filter(Boolean).join(' ')].filter(Boolean).join(' – ')

  async function copy(list: CommunityList, text: string) {
    await window.api.clipboard.writeText(text)
    setCopiedId(list.id)
    setTimeout(() => setCopiedId((id) => (id === list.id ? null : id)), 1500)
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
            <button
              className="btn"
              onClick={() => {
                setError(null)
                setAttempt((n) => n + 1)
              }}
            >
              {t.communityLists.retry}
            </button>
          </div>
        ) : !lists ? (
          <div className="text-dim">{t.communityLists.loading}</div>
        ) : lists.length === 0 ? (
          <div className="text-dim">{t.communityLists.empty}</div>
        ) : (
          <>
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
              {legends.map(([id, { name, n }]) => (
                <option key={id} value={id}>
                  {name} ({n})
                </option>
              ))}
            </select>
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
                        const domains = card?.colors.filter((d) => DOMAIN_COLORS[d]) ?? []
                        const accent = DOMAIN_COLORS[domains[0]] ?? 'var(--accent)'
                        const accent2 = DOMAIN_COLORS[domains[1]] ?? accent
                        return (
                          <li
                            key={list.id}
                            className={`community-entry ${open ? 'open' : ''}`}
                            style={{ '--domain-a': accent, '--domain-b': accent2 } as CSSProperties}
                          >
                            {card?.imageUrl && <img className="community-wash" src={card.imageUrl} alt="" loading="lazy" aria-hidden />}
                            <button className="community-row" aria-expanded={open} onClick={() => setOpenId(open ? null : list.id)}>
                              <span className={`community-rank ${medal(list.rank)}`}>{list.rank ?? '–'}</span>
                              <span className="community-legend-art">
                                {card?.imageUrl ? <img src={card.imageUrl} alt="" loading="lazy" /> : <span>{list.legendName.slice(0, 1)}</span>}
                              </span>
                              <span className="community-main">
                                <span className="community-legend-name">{list.legendName}</span>
                                {list.player && <span className="community-player">{t.communityLists.by(list.player)}</span>}
                              </span>
                              {domains.length > 0 && (
                                <span className="community-domains" aria-label={domains.join(', ')}>
                                  {domains.map((d) => (
                                    <span key={d} className="community-domain" style={{ background: DOMAIN_COLORS[d] }} title={d} />
                                  ))}
                                </span>
                              )}
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
            {filtered.length > shown && (
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
