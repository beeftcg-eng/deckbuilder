import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, useCardsById, useOwnedIndex } from '../state/useAppStore'
import { useCommunityLists } from '../state/communityLists'
import { COMMUNITY_LISTS_URL, type CommunityList } from '../shared/communityLists'
import { coreDeck, legendMeta, listDeck, listOwnership, recordsVsLegends, type ListDeck, type ListOwnership } from '../shared/communityMeta'
import { cardForCode, codeIndex, deckCodeToText } from '../shared/riftboundDeckCode'
import { getAdapter } from '../shared/games/registry'
import type { PairingsResult } from '../shared/types'
import { t } from '../shared/i18n'
import { Rich } from './Rich'
import { CommunityListRow } from './community/CommunityListRow'
import { CommunityMetaView } from './community/CommunityMetaView'
import { CommunityEventsView } from './community/CommunityEventsView'
import { listName } from './community/communityHelpers'

const PAGE = 40

type Tab = 'lists' | 'meta' | 'events'
const TABS: Tab[] = ['lists', 'meta', 'events']
const TAB_LABEL = (tab: Tab) => (tab === 'lists' ? t.communityLists.tabLists : tab === 'meta' ? t.communityLists.tabMeta : t.communityLists.tabEvents)
type Sort = 'newest' | 'owned' | 'cheapest'

/**
 * Recent Riftbound tournament lists from RiftAtlas (shared/communityLists.ts, state/communityLists.ts).
 * **Lists**: by event (or by how much of each you own, or what it costs to finish), each with its
 * Legend's art; opening one shows its cards and what to do with it (community/CommunityListRow.tsx).
 * **Meta**: how often each Legend places, how you do against it, and its card choices
 * (community/CommunityMetaView.tsx).
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
  const pairingsRecords = useAppStore((s) => s.pairingsRecords)
  const index = useMemo(() => codeIndex(cardsById.values()), [cardsById])
  const { lists, file, offline, loading, error, retry } = useCommunityLists(cardsById.size > 0)
  const [tab, setTab] = useState<Tab>('lists')
  const [sort, setSort] = useState<Sort>('newest')
  const [legend, setLegend] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)

  const decks = useMemo(() => {
    const out = new Map<string, ListDeck>()
    for (const l of lists ?? []) {
      const deck = listDeck(l, index)
      if (deck) out.set(l.id, deck)
    }
    return out
  }, [lists, index])
  const myRiftboundDecks = useMemo(() => myDecks.filter((d) => d.gameId === 'riftbound').sort((a, b) => a.name.localeCompare(b.name)), [myDecks])
  const myResults = useMemo((): PairingsResult[] => myRiftboundDecks.flatMap((d) => pairingsRecords?.[d.id] ?? []), [myRiftboundDecks, pairingsRecords])
  const records = useMemo(() => (myResults.length ? recordsVsLegends(legendMeta(lists ?? []), myResults) : new Map()), [myResults, lists])

  const legends = useMemo(() => legendMeta(lists ?? []), [lists])
  const byLegend = useMemo(() => (lists ?? []).filter((l) => !legend || l.legendId === legend), [lists, legend])
  const ownershipFor = (ids: readonly CommunityList[]) => {
    const out = new Map<string, ListOwnership>()
    for (const l of ids) {
      const deck = decks.get(l.id)
      if (deck) out.set(l.id, listOwnership(deck, cardsById, cards ?? [], owned))
    }
    return out
  }
  // Sorting by what you own needs every list's buy list; newest first only the rows on screen do.
  const ownershipAll = useMemo(() => (sort === 'newest' ? null : ownershipFor(byLegend)), [sort, byLegend, decks, cardsById, cards, owned]) // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    if (!ownershipAll) return byLegend
    const key = (l: CommunityList) => {
      const o = ownershipAll.get(l.id)
      if (!o) return Infinity
      return sort === 'owned' ? -(o.needed ? o.owned / o.needed : 0) : o.missingCost
    }
    return byLegend.map((l) => ({ l, k: key(l) })).sort((a, b) => a.k - b.k).map((x) => x.l)
  }, [byLegend, ownershipAll, sort])
  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown])
  const ownership = useMemo(() => ownershipAll ?? ownershipFor(visible), [ownershipAll, visible, decks, cardsById, cards, owned]) // eslint-disable-line react-hooks/exhaustive-deps
  // Newest first, an event's finishes sit together under its name; sorted another way, each row names its event.
  const groups = useMemo(() => {
    const out: { key: string; lists: CommunityList[] }[] = []
    for (const list of visible) {
      const key = sort === 'newest' ? `${list.eventId}|${list.eventName}` : ''
      if (out.at(-1)?.key === key) out.at(-1)!.lists.push(list)
      else out.push({ key, lists: [list] })
    }
    return out
  }, [visible, sort])

  const textFor = (list: CommunityList): string | null => {
    try {
      return deckCodeToText(list.deckCode, cardsById.values(), index)
    } catch {
      return null
    }
  }

  async function startFromCore(legendId: string, legendName: string) {
    const core = coreDeck([...decks.values()].filter((d) => d.list.legendId === legendId), cardsById)
    const matchedCopies = Object.values(core.zones).reduce((n, entries) => n + entries.reduce((m, e) => m + e.quantity, 0), 0)
    await useAppStore.getState().importDeck('riftbound', { ...core, name: null, formatLabel: null, unmatched: [], matchedCopies }, t.communityLists.coreName(legendName), 'constructed')
    onClose()
  }

  const asOf = file ? new Date(file.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null

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
            {asOf && <span className="community-updated"> {loading ? t.communityLists.refreshing : t.communityLists.updated(asOf)}</span>}
          </span>
          <button className="btn" onClick={() => void window.api.system.openExternal(COMMUNITY_LISTS_URL)}>
            {t.communityLists.openSource}
          </button>
        </div>
        {offline && asOf && (
          <div className="community-error">
            <span className="community-offline">{t.communityLists.offline(asOf)}</span>
            <button className="btn" onClick={retry}>
              {t.communityLists.retry}
            </button>
          </div>
        )}

        {cardsById.size === 0 ? (
          <div className="text-dim">{t.importDeck.noData(getAdapter('riftbound').shortName)}</div>
        ) : error && !lists ? (
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
              <div className="compare-source" role="tablist" aria-label={t.communityLists.title}>
                {TABS.map((id) => (
                  <button
                    key={id}
                    id={`community-tab-${id}`}
                    role="tab"
                    aria-selected={tab === id}
                    aria-controls="community-panel"
                    tabIndex={tab === id ? 0 : -1}
                    className={`btn ${tab === id ? 'btn-primary' : ''}`}
                    onClick={() => setTab(id)}
                    onKeyDown={(e) => {
                      // The tab pattern: arrow keys move between tabs, Home/End to the ends.
                      const i = TABS.indexOf(id)
                      const next = e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length] : e.key === 'ArrowLeft' ? TABS[(i + TABS.length - 1) % TABS.length] : e.key === 'Home' ? TABS[0] : e.key === 'End' ? TABS[TABS.length - 1] : null
                      if (!next) return
                      e.preventDefault()
                      setTab(next)
                      document.getElementById(`community-tab-${next}`)?.focus()
                    }}
                  >
                    {TAB_LABEL(id)}
                  </button>
                ))}
              </div>
              {tab === 'lists' && (
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
                    {legends.map((m) => (
                      <option key={m.legendId} value={m.legendId}>
                        {m.legendName} ({m.lists})
                      </option>
                    ))}
                  </select>
                  <select
                    className="community-sort"
                    value={sort}
                    aria-label={t.communityLists.sortLabel}
                    onChange={(e) => {
                      setSort(e.target.value as Sort)
                      setShown(PAGE)
                      setOpenId(null)
                    }}
                  >
                    <option value="newest">{t.communityLists.sortNewest}</option>
                    <option value="owned">{t.communityLists.sortOwned}</option>
                    <option value="cheapest">{t.communityLists.sortCheapest}</option>
                  </select>
                </>
              )}
            </div>

            <div id="community-panel" role="tabpanel" aria-labelledby={`community-tab-${tab}`} className="community-panel">
              {tab === 'events' ? (
                <CommunityEventsView
                  lists={lists}
                  results={myResults}
                  index={index}
                  onLegend={(id) => {
                    setLegend(id)
                    setTab('meta')
                  }}
                />
              ) : tab === 'meta' ? (
                <CommunityMetaView
                  lists={lists}
                  decks={decks}
                  cardsById={cardsById}
                  index={index}
                  records={records}
                  legend={legend}
                  onLegend={setLegend}
                  onImportNewest={(list) => {
                    const text = textFor(list)
                    if (text) onImport(text, listName(list))
                  }}
                  onStartFromCore={(id, name) => void startFromCore(id, name)}
                />
              ) : (
                <div className="community-scroll">
                  {groups.map((group) => {
                    const first = group.lists[0]
                    return (
                      <section key={group.key || 'all'} className="community-event-group">
                        {sort === 'newest' && (
                          <header className="community-event-header">
                            <span className="community-event-name">{first.eventName}</span>
                            <span className="community-event-meta">
                              {[first.players != null ? t.communityLists.players(first.players) : null, first.date ? new Date(first.date).toLocaleDateString() : null]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </header>
                        )}
                        <ul className="community-list">
                          {group.lists.map((list) => (
                            <CommunityListRow
                              key={list.id}
                              list={list}
                              deck={decks.get(list.id)}
                              legendCard={cardForCode(index, list.legendId)}
                              ownership={ownership.get(list.id)}
                              cardsById={cardsById}
                              index={index}
                              showEvent={sort !== 'newest'}
                              open={openId === list.id}
                              onToggle={() => setOpenId(openId === list.id ? null : list.id)}
                              myDecks={myRiftboundDecks}
                              onImport={onImport}
                              onCompare={onCompare}
                            />
                          ))}
                        </ul>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
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
