import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ownedIndexOf, useAppStore, useCardsById } from '../state/useAppStore'
import { useProxyList } from '../state/proxyList'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { parseDecklistText } from '../shared/importDeck'
import { poolKey } from '../shared/collection'
import { matchesPrintedCode, matchRank } from '../shared/cardSearch'
import { choosePrinting } from '../shared/printings'
import { defaultPaper, pageLayout, proxyCopies, type Paper } from '../shared/proxies'
import { renderProxyPdf } from '../lib/proxyPdf'
import type { Card, Deck, GameId } from '../shared/types'
import { t, zoneLabel } from '../shared/i18n'
import { Rich } from './Rich'

const MAX_RESULTS = 8
const LIST_ZONE = 'proxies'

type Props = { deck: Deck; cardsById: Map<string, Card>; onClose: () => void } | { deck?: undefined; gameId: GameId; onClose: () => void }

/**
 * Saves cards as a printable PDF of real-size proxies (shared/proxies.ts, lib/proxyPdf.ts): a deck's
 * (the wishlist passes its cards as one), or, opened without one (the sidebar's Proxies button), the
 * game's print list (state/proxyList.ts), which you fill by searching, pasting a list, or "Add to
 * proxies" on a card.
 */
export function ProxyPrintModal(props: Props) {
  const { onClose } = props
  const gameId = props.deck ? props.deck.gameId : props.gameId
  const adapter = getAdapter(gameId)
  const catalogCardsById = useCardsById(gameId)
  const cardsById = props.deck ? props.cardsById : catalogCardsById
  const collection = useAppStore((s) => s.collection)
  const catalogs = useAppStore((s) => s.catalogs)
  const listEntries = useProxyList((s) => s.lists[gameId])

  const deck = useMemo<Deck>(() => {
    if (props.deck) return props.deck
    const now = new Date().toISOString()
    return { id: 'proxy-list', gameId, name: t.proxies.listName, formatId: '', zones: { [LIST_ZONE]: listEntries ?? [] }, freeTextZones: {}, createdAt: now, updatedAt: now }
  }, [props.deck, listEntries, gameId])
  const zones = useMemo(
    () => (props.deck ? rulesForFormat(adapter, deck.formatId).zones.filter((z) => (deck.zones[z.id] ?? []).length > 0) : []),
    [props.deck, adapter, deck],
  )

  const [paper, setPaper] = useState<Paper>(() => defaultPaper(navigator.language))
  const [skippedZones, setSkippedZones] = useState<Set<string>>(() => new Set())
  const [missingOnly, setMissingOnly] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  // Only filtered when there's a choice: the print list and the wishlist are one zone of their own.
  const zoneIds = useMemo(() => (zones.length > 1 ? new Set(zones.map((z) => z.id).filter((id) => !skippedZones.has(id))) : undefined), [zones, skippedZones])
  const owned = useMemo(() => (missingOnly ? ownedIndexOf(collection, catalogs) : undefined), [missingOnly, collection, catalogs])
  const copies = useMemo(() => proxyCopies(deck, cardsById, { zoneIds, owned, zoneOrder: zones.map((z) => z.id) }), [deck, cardsById, zoneIds, owned, zones])
  const total = copies.reduce((sum, c) => sum + c.copies, 0)
  const perPage = pageLayout(paper, deck.gameId).slots.length
  const pages = Math.ceil(total / perPage)

  function toggleZone(id: string) {
    setSkippedZones((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleMake() {
    setMessage(null)
    setProgress({ done: 0, total: copies.length })
    try {
      const pdf = await renderProxyPdf(copies, deck.gameId, paper, (done, of) => setProgress({ done, total: of }))
      const saved = await window.api.exportSavePdf(pdf.bytes, t.proxies.fileName(deck.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'deck'))
      const parts = saved ? [t.proxies.saved(pdf.pages)] : []
      if (pdf.missingImages > 0) parts.push(t.proxies.missingImages(pdf.missingImages))
      setMessage(parts.length ? { text: parts.join(' ') } : null)
    } catch (err) {
      setMessage({ text: t.proxies.failed(err instanceof Error ? err.message : String(err)), error: true })
    } finally {
      setProgress(null)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal proxy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{props.deck ? t.proxies.title(deck.name) : t.proxies.listTitle(adapter.shortName)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <div className="text-dim">
          <Rich text={t.proxies.intro} />
        </div>

        {!props.deck &&
          (cardsById.size === 0 ? (
            <div className="text-dim">{t.importDeck.noData(adapter.shortName)}</div>
          ) : (
            <PrintList gameId={gameId} cardsById={cardsById} />
          ))}

        <label className="proxy-option">
          <span>{t.proxies.paper}</span>
          <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
            <option value="letter">{t.proxies.letter}</option>
            <option value="a4">{t.proxies.a4}</option>
          </select>
        </label>

        {zones.length > 1 && (
          <div className="proxy-option">
            <span>{t.proxies.zones}</span>
            <div className="proxy-zones">
              {zones.map((z) => (
                <label key={z.id}>
                  <input type="checkbox" checked={zoneIds?.has(z.id) ?? true} onChange={() => toggleZone(z.id)} /> {zoneLabel(z.label)}
                </label>
              ))}
            </div>
          </div>
        )}

        <label className="proxy-option">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} /> {t.proxies.missingOnly}
        </label>

        <div className="import-summary">
          {total > 0 ? t.proxies.summary(total, pages) : props.deck ? t.proxies.nothing : t.proxies.listEmpty}
          {!props.deck && total % perPage > 0 && ` ${t.proxies.roomLeft(perPage - (total % perPage))}`}
        </div>

        <div className="import-fields">
          <button className="btn btn-primary" disabled={total === 0 || progress !== null} onClick={handleMake}>
            {progress ? t.proxies.making(progress.done, progress.total) : t.proxies.make}
          </button>
        </div>
        {message && <div className={message.error ? 'sync-error' : 'text-dim'}>{message.text}</div>}
        <div className="text-dim proxy-note">{t.proxies.note}</div>
      </div>
    </div>,
    document.body,
  )
}

/** The print list: a search to add cards, a paste box for a whole list, and the cards picked so far. */
function PrintList({ gameId, cardsById }: { gameId: GameId; cardsById: Map<string, Card> }) {
  const entries = useProxyList((s) => s.lists[gameId]) ?? []
  const add = useProxyList((s) => s.add)
  const setQuantity = useProxyList((s) => s.setQuantity)
  const swap = useProxyList((s) => s.swap)
  const clear = useProxyList((s) => s.clear)
  const collection = useAppStore((s) => s.collection)
  const adapter = getAdapter(gameId)

  const [query, setQuery] = useState('')
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [unmatched, setUnmatched] = useState<string[]>([])

  // Every printing of a card, so a search shows each card once and each row can switch printings.
  const printings = useMemo(() => {
    const byPool = new Map<string, Card[]>()
    for (const card of cardsById.values()) {
      const key = poolKey(card)
      const list = byPool.get(key)
      if (list) list.push(card)
      else byPool.set(key, [card])
    }
    return byPool
  }, [cardsById])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const hits: { card: Card; rank: number }[] = []
    for (const [, cards] of printings) {
      let best: { card: Card; rank: number } | null = null
      for (const card of cards) {
        const rank = matchRank(card, q)
        const hit = rank < 5 || matchesPrintedCode(card, q)
        if (hit && (!best || rank < best.rank)) best = { card, rank }
      }
      // A code search ("OP01-006") means that printing; a name search gets the usual pick.
      if (best) hits.push({ card: best.rank < 5 ? (choosePrinting(cards, { owned: (c) => collection[c.id] ?? 0 }) ?? best.card) : best.card, rank: best.rank })
    }
    return hits
      .sort((a, b) => a.rank - b.rank || a.card.name.localeCompare(b.card.name))
      .slice(0, MAX_RESULTS)
      .map((h) => h.card)
  }, [query, printings, collection])

  function pick(card: Card) {
    add(card)
    setQuery('')
  }

  function addPasted() {
    const parsed = parseDecklistText(text, adapter, cardsById)
    for (const list of Object.values(parsed.zones)) for (const { cardId, quantity } of list) {
      const card = cardsById.get(cardId)
      if (card) add(card, quantity)
    }
    setUnmatched(parsed.unmatched)
    if (parsed.unmatched.length === 0) {
      setText('')
      setPasting(false)
    }
  }

  return (
    <div className="proxy-list">
      <div className="proxy-search">
        <input
          autoFocus
          value={query}
          placeholder={t.proxies.searchPlaceholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) pick(results[0])
            if (e.key === 'Escape' && query) {
              e.stopPropagation()
              setQuery('')
            }
          }}
        />
        {results.length > 0 && (
          <ul className="proxy-results">
            {results.map((card) => (
              <li key={card.id}>
                <button onClick={() => pick(card)}>
                  {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="proxy-thumb-empty" />}
                  <span>{card.name}</span>
                  <span className="text-dim">
                    {card.setCode} {card.number}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pasting ? (
        <>
          <textarea className="export-textarea" placeholder={t.proxies.listPlaceholder} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="proxy-list-actions">
            <button className="btn btn-primary" disabled={!text.trim()} onClick={addPasted}>
              {t.proxies.addPasted}
            </button>
            <button className="btn" onClick={() => setPasting(false)}>
              {t.common.cancel}
            </button>
          </div>
          {unmatched.length > 0 && (
            <div className="sync-error">
              {t.proxies.unmatched(unmatched.length)} {unmatched.slice(0, 3).join(' · ')}
              {unmatched.length > 3 && ` ${t.importDeck.andMore(unmatched.length - 3)}`}
            </div>
          )}
        </>
      ) : (
        <button className="proxy-link" onClick={() => setPasting(true)}>
          {t.proxies.pasteInstead}
        </button>
      )}

      {entries.length > 0 && (
        <>
          <ul className="proxy-picked">
            {entries.map((entry) => {
              const card = cardsById.get(entry.cardId)
              if (!card) return null
              const others = printings.get(poolKey(card)) ?? [card]
              return (
                <li key={entry.cardId}>
                  {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="proxy-thumb-empty" />}
                  <div className="proxy-picked-name">
                    <span>{card.name}</span>
                    {others.length > 1 ? (
                      <select value={card.id} title={t.proxies.printingTitle} onChange={(e) => swap(gameId, card.id, e.target.value)}>
                        {others.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.setCode} {c.number}
                            {c.rarity ? ` · ${c.rarity}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-dim">
                        {card.setCode} {card.number}
                      </span>
                    )}
                  </div>
                  <div className="stepper">
                    <button className="btn stepper-btn" onClick={() => setQuantity(gameId, card.id, entry.quantity - 1)}>
                      −
                    </button>
                    <span className="stepper-value">{entry.quantity}</span>
                    <button className="btn stepper-btn" onClick={() => setQuantity(gameId, card.id, entry.quantity + 1)}>
                      +
                    </button>
                  </div>
                  <button className="deck-row-delete" title={t.proxies.remove} onClick={() => setQuantity(gameId, card.id, 0)}>
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
          <button className="proxy-link" onClick={() => clear(gameId)}>
            {t.proxies.clearList}
          </button>
        </>
      )}
    </div>
  )
}
