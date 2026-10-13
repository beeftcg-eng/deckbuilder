import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCardsById } from '../state/useAppStore'
import { COMMUNITY_LISTS_URL, fromRiftAtlas, type CommunityList } from '../shared/communityLists'
import { deckCodeToText } from '../shared/riftboundDeckCode'
import { getAdapter } from '../shared/games/registry'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

const PAGE = 40
/** The page changes when a new event is added, so one read lasts a while. */
const CACHE_MS = 30 * 60 * 1000
let cache: { at: number; lists: CommunityList[] } | null = null

/** "3 ogn-066-298 Ahri, Alluring" as "3 Ahri, Alluring", for the preview. */
const withoutSourceId = (line: string) => line.replace(/^(\d+) [a-z]+-[^\s]+ /, '$1 ')

/**
 * Recent Riftbound tournament lists from RiftAtlas (shared/communityLists.ts), by Legend. Opening one
 * shows its cards; Import hands it to the import window (`onImport`), and Copy puts the list on the
 * clipboard for Compare's paste box or anywhere else.
 */
export function CommunityListsModal({ onImport, onClose }: { onImport: (text: string, name: string) => void; onClose: () => void }) {
  const cardsById = useCardsById('riftbound')
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
          <Rich text={t.communityLists.source} />
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
            <ul className="community-list">
              {filtered.slice(0, shown).map((list) => {
                const open = openId === list.id
                const text = open ? textFor(list) : null
                return (
                  <li key={list.id} className={open ? 'open' : undefined}>
                    <button className="community-row" aria-expanded={open} onClick={() => setOpenId(open ? null : list.id)}>
                      <span className="community-rank">{list.rank != null ? t.communityLists.place(list.rank) : ''}</span>
                      <span className="community-main">
                        <b>{list.legendName}</b>
                        {list.player && <span className="text-dim"> {t.communityLists.by(list.player)}</span>}
                        <span className="community-event text-dim">
                          {[list.eventName, list.players != null ? t.communityLists.players(list.players) : null, list.date ? new Date(list.date).toLocaleDateString() : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </button>
                    {open &&
                      (text ? (
                        <div className="community-detail">
                          <pre className="community-cards">{text.split('\n').map(withoutSourceId).join('\n')}</pre>
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
                        <div className="sync-error">{t.communityLists.badCode}</div>
                      ))}
                  </li>
                )
              })}
            </ul>
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
