import { useState } from 'react'
import { useAppStore, useOwnedIndex } from '../../state/useAppStore'
import type { CommunityList } from '../../shared/communityLists'
import { tradeOffersFor, type ListDeck, type ListOwnership, type TradeOffer } from '../../shared/communityMeta'
import { deckCodeToText } from '../../shared/riftboundDeckCode'
import { formatPrice } from '../../shared/collection'
import { displayCurrency, displayRate, formatMoney } from '../../shared/currency'
import { targetToUsd } from '../../shared/priceAlerts'
import { askToNotify } from '../../lib/notify'
import type { Card, Deck } from '../../shared/types'
import { t } from '../../shared/i18n'
import { DomainPips, LegendArt, LegendWash } from './communityUi'
import { legendLook, listName, medal, textSections } from './communityHelpers'

interface Props {
  list: CommunityList
  deck: ListDeck | undefined
  legendCard: Card | undefined
  ownership: ListOwnership | undefined
  cardsById: Map<string, Card>
  index: Map<string, Card>
  /** Show the event on the row (when the lists aren't grouped under their events). */
  showEvent: boolean
  open: boolean
  onToggle: () => void
  myDecks: Deck[]
  onImport: (text: string, name: string) => void
  onCompare: (deckId: string, text: string, name: string) => void
}

/** One list in the Community lists window: its Legend, placing and ownership; opened, its cards and what to do with it. */
export function CommunityListRow({ list, deck, legendCard, ownership, cardsById, index, showEvent, open, onToggle, myDecks, onImport, onCompare }: Props) {
  const { domains, style } = legendLook(legendCard)
  return (
    <li className={`community-entry ${open ? 'open' : ''}`} style={style}>
      <LegendWash card={legendCard} />
      <button className="community-row" aria-expanded={open} onClick={onToggle}>
        <span className={`community-rank ${medal(list.rank)}`}>{list.rank ?? '–'}</span>
        <LegendArt card={legendCard} name={list.legendName} />
        <span className="community-main">
          <span className="community-legend-name">{list.legendName}</span>
          {(list.player || showEvent) && (
            <span className="community-player">{[list.player ? t.communityLists.by(list.player) : null, showEvent ? list.eventName : null].filter(Boolean).join(' · ')}</span>
          )}
          <OwnershipChip ownership={ownership} />
        </span>
        <DomainPips domains={domains} />
        <span className="community-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && <ListDetail list={list} deck={deck} cardsById={cardsById} index={index} myDecks={myDecks} onImport={onImport} onCompare={onCompare} />}
    </li>
  )
}

function OwnershipChip({ ownership }: { ownership: ListOwnership | undefined }) {
  if (!ownership?.needed) return null
  if (ownership.owned >= ownership.needed) return <span className="community-own complete">{t.communityLists.ownAll}</span>
  return (
    <span className="community-own">
      {t.communityLists.own(ownership.owned, ownership.needed)}
      {ownership.missingCost > 0 && <> · {t.communityLists.toFinish(formatPrice(ownership.missingCost))}</>}
    </span>
  )
}

function ListDetail({
  list,
  deck,
  cardsById,
  index,
  myDecks,
  onImport,
  onCompare,
}: Pick<Props, 'list' | 'deck' | 'cardsById' | 'index' | 'myDecks' | 'onImport' | 'onCompare'>) {
  const [comparing, setComparing] = useState(false)
  const [copied, setCopied] = useState(false)
  let text: string | null = null
  try {
    text = deckCodeToText(list.deckCode, cardsById.values(), index)
  } catch {
    text = null
  }
  if (!text) return <div className="sync-error community-detail">{t.communityLists.badCode}</div>

  async function copy(value: string) {
    await window.api.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="community-detail">
      <div className="community-sections">
        {textSections(text).map((s) => (
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
        <button className="btn btn-primary" onClick={() => onImport(text, listName(list))}>
          {t.communityLists.import}
        </button>
        {comparing ? (
          myDecks.length ? (
            <select autoFocus defaultValue="" aria-label={t.communityLists.compareWith} onChange={(e) => e.target.value && onCompare(e.target.value, text, listName(list))}>
              <option value="" disabled>
                {t.communityLists.compareWith}
              </option>
              {myDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-dim">{t.communityLists.noDecks}</span>
          )
        ) : (
          <button className="btn" onClick={() => setComparing(true)}>
            {t.communityLists.compare}
          </button>
        )}
        <button className="btn" onClick={() => void copy(text)}>
          {copied ? t.communityLists.copied : t.communityLists.copy}
        </button>
      </div>
      <div className="community-extras">
        <WatchPrice list={list} />
        {deck && <TradeCheck deck={deck} cardsById={cardsById} />}
      </div>
    </div>
  )
}

/** 🔔 Watch price: tell me when this list costs a target or less to finish (communityMeta.ts checkListWatches). */
function WatchPrice({ list }: { list: CommunityList }) {
  const watch = useAppStore((s) => s.settings.listWatches?.[list.id])
  const setListWatch = useAppStore((s) => s.setListWatch)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [invalid, setInvalid] = useState(false)
  const rate = displayRate()

  if (watch && !editing) {
    return (
      <div className="community-actions community-watch">
        <button className={`btn price-alert-btn set ${watch.hit ? 'hit' : ''}`} onClick={() => setEditing(true)}>
          {t.communityLists.watching(formatMoney(watch.target))}
        </button>
        <button className="btn" onClick={() => setListWatch(list.id, null)}>
          {t.communityLists.stopWatching}
        </button>
      </div>
    )
  }
  if (!editing) {
    return (
      <div className="community-actions community-watch">
        <button className="btn" onClick={() => setEditing(true)}>
          {t.communityLists.watch}
        </button>
      </div>
    )
  }
  return (
    <form
      className="community-watch-form"
      onSubmit={(e) => {
        e.preventDefault()
        const usd = targetToUsd(text, rate)
        if (usd == null) {
          setInvalid(true)
          return
        }
        askToNotify()
        setListWatch(list.id, { name: listName(list), deckCode: list.deckCode, target: usd })
        setEditing(false)
      }}
    >
      <label>
        <span className="text-dim">{t.communityLists.watchLabel(displayCurrency())}</span>
        <input
          type="text"
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setInvalid(false)
          }}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
      </label>
      <button className="btn btn-primary" type="submit">
        {t.communityLists.watchSave}
      </button>
      {invalid && <span className="sync-error">{t.communityLists.watchInvalid}</span>}
    </form>
  )
}

/**
 * 🤝 Who trades these?: the list's missing cards on other people's trade lists. Reads Browse only when
 * pressed (it downloads every public collection), and reuses what Trade already loaded.
 */
function TradeCheck({ deck, cardsById }: { deck: ListDeck; cardsById: Map<string, Card> }) {
  const connected = useAppStore((s) => s.pawmodoroConfig.connected)
  const traders = useAppStore((s) => s.browseTraders)
  const owned = useOwnedIndex()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function check() {
    setState('loading')
    setError(null)
    try {
      if (!useAppStore.getState().browseTraders.length) await useAppStore.getState().loadBrowseTraders()
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('idle')
    }
  }

  if (state === 'idle') {
    return (
      <div className="community-actions community-trades">
        <button className="btn" disabled={!connected} title={connected ? undefined : t.communityLists.tradesSignIn} onClick={() => void check()}>
          {t.communityLists.checkTrades}
        </button>
        {!connected && <span className="text-dim">{t.communityLists.tradesSignIn}</span>}
        {error && <span className="sync-error">{t.communityLists.tradesFailed(error)}</span>}
      </div>
    )
  }
  if (state === 'loading') return <div className="text-dim community-trades">{t.communityLists.tradesLoading}</div>
  const { offers, missingCards } = tradeOffersFor(deck, cardsById, owned, traders)
  return <TradeOffers offers={offers} missingCards={missingCards} />
}

function TradeOffers({ offers, missingCards }: { offers: TradeOffer[]; missingCards: number }) {
  if (!offers.length) return <div className="text-dim community-trades">{t.communityLists.tradesNone}</div>
  return (
    <div className="community-trades">
      <div className="text-dim">{t.communityLists.tradesFound(offers.length, missingCards)}</div>
      <ul className="community-trade-list">
        {offers.map((o) => (
          <li key={o.card.id}>
            <span className="community-count">{o.missing}</span> {o.card.name.replace(/\s*\([^)]*\)$/, '')} <span className="text-dim">· {o.traders.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
