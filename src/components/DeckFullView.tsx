import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { checkDeckLegality } from '../shared/legality'
import { computeDeckStats } from '../shared/deckStats'
import { formatPrice } from '../shared/collection'
import { DECK_VIEW_MODES, buildDeckView, textBlocks, type DeckViewEntry } from '../shared/deckView'
import type { Card, Deck, Format } from '../shared/types'
import { CardDetailModal } from './CardDetailModal'
import { DeckLockButton } from './DeckLockButton'
import { ExportModal } from './ExportModal'
import { PairingsRecordStrip } from './PairingsRecordStrip'
import { PairingsSyncReminder } from './PairingsSyncReminder'
import { PairingsStatsModal } from './PairingsStatsModal'
import { t, zoneLabel } from '../shared/i18n'
import { formatLabel } from '../shared/formatText'

interface Props {
  deck: Deck
  format: Format | undefined
  cardsById: Map<string, Card>
  /** Go to the deck editor. */
  onEdit: () => void
}

/**
 * The finished deck, filling the deck area (the whole window while it's showing): card images (Grid), compact rows (List) or the
 * plain-text decklist (Text). A button hands the window over to the OS's real full screen too.
 */
export function DeckFullView({ deck, format, cardsById, onEdit }: Props) {
  const adapter = getAdapter(deck.gameId)
  const mode = useAppStore((s) => s.settings.deckViewMode ?? 'grid')
  const setMode = useAppStore((s) => s.setDeckViewMode)
  const setCardQuantity = useAppStore((s) => s.setCardQuantity)
  const locked = Boolean(deck.locked)

  const [cardWidth, setCardWidth] = useState(200)
  const [detail, setDetail] = useState<Card | null>(null)
  const [osFullscreen, setOsFullscreen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showStats, setShowStats] = useState(false)

  const zones = useMemo(() => rulesForFormat(adapter, deck.formatId), [adapter, deck.formatId])
  const sections = useMemo(() => buildDeckView(deck, zones, cardsById), [deck, zones, cardsById])
  const stats = useMemo(() => computeDeckStats(deck, cardsById), [deck, cardsById])
  const legality = useMemo(() => (format ? checkDeckLegality(deck, adapter, format, cardsById) : null), [deck, adapter, format, cardsById])
  const text = useMemo(() => adapter.formatDecklistText(deck, cardsById), [adapter, deck, cardsById])
  const blocks = useMemo(() => textBlocks(text), [text])

  // Esc closes the card in front. (In the OS's full screen, Esc leaves that first and never reaches us.)
  useEffect(() => {
    if (!detail) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !document.fullscreenElement) setDetail(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detail])

  useEffect(() => {
    const onChange = () => setOsFullscreen(document.fullscreenElement != null)
    document.addEventListener('fullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])

  function toggleOsFullscreen() {
    try {
      const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()
      void request.catch(() => undefined)
    } catch {
      // No Fullscreen API here; the full-window view still works.
    }
  }

  function handleCopy() {
    window.api.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const priced = stats.totalCards > stats.price.unpricedCopies

  /**
   * −/+ for one entry. + adds a copy of the printing shown; − takes one from the last printing merged into it, so
   * the picture only changes once that printing is gone. Hidden while the deck is locked.
   */
  function renderStepper(zoneId: string, { card, quantity, copies }: DeckViewEntry) {
    if (locked) return null
    const zone = zones.zones.find((z) => z.id === zoneId)
    const max = zone?.maxCopiesPerCard ?? adapter.copyLimitFor?.(card) ?? zones.defaultMaxCopiesPerCard
    const last = copies[copies.length - 1]
    return (
      <span className="fv-stepper" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <button className="btn stepper-btn" title={t.deckView.removeCopy} onClick={() => setCardQuantity(zoneId, last.card, last.quantity - 1)}>
          −
        </button>
        <button
          className="btn stepper-btn"
          title={quantity >= max ? t.deckView.maxCopies(max) : t.deckView.addCopy}
          disabled={quantity >= max}
          onClick={() => setCardQuantity(zoneId, card, copies[0].quantity + 1)}
        >
          +
        </button>
      </span>
    )
  }

  /** The card or row opens the card's details; it's a div (not a button) because it holds the −/+ buttons. */
  function openProps(card: Card) {
    return {
      role: 'button',
      tabIndex: 0,
      onClick: () => setDetail(card),
      onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setDetail(card)
        }
      },
    }
  }

  function renderCard(zoneId: string, entry: DeckViewEntry) {
    const { card, quantity, printings } = entry
    return (
      <div key={card.id} className="fv-card" {...openProps(card)} title={t.deckView.cardTitle(card.name, printings)}>
        {card.imageUrl ? (
          <img src={card.imageUrl} alt={card.name} loading="lazy" style={{ aspectRatio: card.orientation === 'landscape' ? '7 / 5' : '5 / 7' }} />
        ) : (
          <div className="fv-card-placeholder" style={{ aspectRatio: card.orientation === 'landscape' ? '7 / 5' : '5 / 7' }}>
            {card.name}
          </div>
        )}
        <span className="fv-qty">×{quantity}</span>
        {renderStepper(zoneId, entry)}
      </div>
    )
  }

  function renderRow(zoneId: string, entry: DeckViewEntry) {
    const { card, quantity, printings } = entry
    return (
      <div key={card.id} className="fv-row" {...openProps(card)}>
        <span className="fv-row-qty">{quantity}×</span>
        {card.imageUrlSmall ? <img className="fv-row-thumb" src={card.imageUrlSmall} alt="" loading="lazy" /> : <span className="fv-row-thumb" />}
        <span className="fv-row-name">
          {card.name}
          {printings > 1 && <span className="text-dim">{t.deckView.printings(printings)}</span>}
        </span>
        <span className="fv-row-detail text-dim">{card.subtypes.join(' ')}</span>
        <span className="fv-row-cost text-dim">{card.cost ?? ''}</span>
        <span className="fv-row-price text-dim">{card.price != null ? formatPrice(card.price * quantity) : ''}</span>
        {renderStepper(zoneId, entry)}
      </div>
    )
  }

  return (
    <div className="deck-view" role="dialog" aria-label={t.deckView.aria(deck.name)}>
      <div className="fv-header">
        <div className="fv-title">
          <strong>
            {deck.locked ? '🔒 ' : ''}
            {deck.name}
          </strong>
          <span className="text-dim">
            {adapter.shortName}
            {format ? ` · ${formatLabel(deck.gameId, format)}` : ''}
          </span>
        </div>
        <div className="fv-summary">
          <span>{t.common.cards(stats.totalCards)}</span>
          {priced && <span className="text-dim">≈ {formatPrice(stats.price.total)}</span>}
          {legality && (
            <span
              className={legality.legal ? 'fv-legal' : 'fv-illegal'}
              title={legality.issues.map((i) => i.message).join('\n') || undefined}
            >
              {legality.legal ? t.deckView.legal : t.deckView.issues(legality.issues.length)}
            </span>
          )}
        </div>

        <div className="fv-modes" role="group" aria-label={t.deckView.view}>
          {DECK_VIEW_MODES.map((m) => (
            <button key={m} className={m === mode ? 'btn btn-primary' : 'btn'} aria-pressed={m === mode} onClick={() => setMode(m)}>
              {t.deckView.modes[m]}
            </button>
          ))}
        </div>

        {mode === 'grid' && (
          <label className="fv-size" title={t.deckView.sizeTitle}>
            <span className="text-dim">{t.deckView.size}</span>
            <input type="range" min={120} max={380} step={10} value={cardWidth} onChange={(e) => setCardWidth(Number(e.target.value))} />
          </label>
        )}

        <div className="fv-actions">
          <button className="btn" onClick={handleCopy}>
            {copied ? t.common.copied : t.deckView.copyList}
          </button>
          {format && (
            <button className="btn" onClick={() => setShowExport(true)} title={t.deckView.exportTitle}>
              {t.deckView.export}
            </button>
          )}
          <button className="btn" onClick={() => setShowStats(true)} title={t.deckStatsModal.buttonTitle}>
            {t.deckStatsModal.button}
          </button>
          <button className="btn" onClick={toggleOsFullscreen} title={t.deckView.fullscreenTitle}>
            {osFullscreen ? t.deckView.exitFullscreen : t.deckView.fullscreen}
          </button>
          <DeckLockButton deck={deck} />
          <button className="btn btn-primary" onClick={onEdit} title={deck.locked ? t.deckView.editLockedTitle : t.deckView.editTitle}>
            {t.deckView.edit}
          </button>
        </div>
      </div>

      <PairingsRecordStrip deck={deck} />
      <PairingsSyncReminder deck={deck} inset />

      <div className="fv-body">
        {sections.length === 0 ? (
          <div className="text-dim fv-empty">{t.deckView.empty}</div>
        ) : mode === 'text' ? (
          <div className="fv-text">
            {blocks.map((block, i) => (
              <pre key={i}>{block}</pre>
            ))}
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.zoneId} className="fv-section">
              <h2 className="fv-section-title">
                {zoneLabel(section.label)} <span className="text-dim">({section.count})</span>
              </h2>
              {section.chips.length > 0 && (
                <div className="fv-chips">
                  {section.chips.map((chip) => (
                    <span key={chip.label} className="stat-chip">
                      {chip.label} <b>{chip.quantity}</b>
                    </span>
                  ))}
                </div>
              )}
              {mode === 'grid'
                ? section.groups.map((group) => (
                    <div key={group.category} className="fv-group">
                      {section.groups.length > 1 && (
                        <h3 className="fv-group-title">
                          {group.category} <span className="text-dim">({group.count})</span>
                        </h3>
                      )}
                      <div className="fv-grid" style={{ '--fv-card-w': `${cardWidth}px` } as CSSProperties}>
                        {group.entries.map((entry) => renderCard(section.zoneId, entry))}
                      </div>
                    </div>
                  ))
                : (
                  <div className="fv-list">
                    {section.groups.map((group) => (
                      <div key={group.category} className="fv-group">
                        {section.groups.length > 1 && (
                          <h3 className="fv-group-title">
                            {group.category} <span className="text-dim">({group.count})</span>
                          </h3>
                        )}
                        {group.entries.map((entry) => renderRow(section.zoneId, entry))}
                      </div>
                    ))}
                  </div>
                )}
            </section>
          ))
        )}
      </div>

      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
      {showStats && <PairingsStatsModal deck={deck} onClose={() => setShowStats(false)} />}
      {showExport && format && <ExportModal deck={deck} format={format} cardsById={cardsById} onClose={() => setShowExport(false)} />}
    </div>
  )
}
