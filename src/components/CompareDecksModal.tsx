import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { parseDecklistText } from '../shared/importDeck'
import { compareDecks, diffText } from '../shared/deckCompare'
import type { Card, Deck } from '../shared/types'
import { t, zoneLabel } from '../shared/i18n'

type Source = 'deck' | 'paste'

/**
 * What changes between this deck and another of the same game - one of yours, or a list pasted in
 * (a tournament winner's, a friend's) without importing it.
 */
export function CompareDecksModal({ deck, cardsById, onClose }: { deck: Deck; cardsById: Map<string, Card>; onClose: () => void }) {
  const adapter = getAdapter(deck.gameId)
  const decks = useAppStore((s) => s.decks)
  const others = useMemo(() => decks.filter((d) => d.gameId === deck.gameId && d.id !== deck.id).sort((a, b) => a.name.localeCompare(b.name)), [decks, deck])
  const [source, setSource] = useState<Source>(others.length ? 'deck' : 'paste')
  const [otherId, setOtherId] = useState(others[0]?.id ?? '')
  const [text, setText] = useState('')
  const [reversed, setReversed] = useState(false)
  const [copied, setCopied] = useState(false)
  const rules = rulesForFormat(adapter, deck.formatId)

  const other = useMemo((): Pick<Deck, 'zones' | 'freeTextZones'> & { name: string } | null => {
    if (source === 'deck') {
      const d = others.find((o) => o.id === otherId)
      return d ? { name: d.name, zones: d.zones, freeTextZones: d.freeTextZones } : null
    }
    if (!text.trim()) return null
    const parsed = parseDecklistText(text, adapter, cardsById, deck.formatId)
    return parsed.matchedCopies ? { name: parsed.name ?? t.compare.pastedList, zones: parsed.zones, freeTextZones: parsed.freeTextZones } : null
  }, [source, others, otherId, text, adapter, cardsById, deck.formatId])

  const [fromName, toName] = reversed ? [other?.name ?? '', deck.name] : [deck.name, other?.name ?? '']
  const diff = useMemo(() => (other ? (reversed ? compareDecks(other, deck, rules, cardsById) : compareDecks(deck, other, rules, cardsById)) : null), [other, reversed, deck, rules, cardsById])

  async function copy() {
    if (!diff) return
    await window.api.clipboard.writeText(`${t.compare.heading(fromName, toName)}\n\n${diffText(diff, zoneLabel)}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal compare-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.compare.title(deck.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>

        <div className="compare-source" role="group" aria-label={t.compare.with}>
          <button className={`btn ${source === 'deck' ? 'btn-primary' : ''}`} aria-pressed={source === 'deck'} disabled={!others.length} onClick={() => setSource('deck')}>
            {t.compare.anotherDeck}
          </button>
          <button className={`btn ${source === 'paste' ? 'btn-primary' : ''}`} aria-pressed={source === 'paste'} onClick={() => setSource('paste')}>
            {t.compare.pasteList}
          </button>
        </div>
        {source === 'deck' ? (
          <select value={otherId} onChange={(e) => setOtherId(e.target.value)} aria-label={t.compare.anotherDeck}>
            {others.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        ) : (
          <textarea className="compare-paste" rows={6} placeholder={t.compare.pastePlaceholder(adapter.shortName)} value={text} onChange={(e) => setText(e.target.value)} />
        )}

        {diff && (
          <>
            <div className="compare-summary">
              <span>
                {t.compare.heading(fromName, toName)}
                {diff.added || diff.removed ? (
                  <>
                    {' '}
                    <b className="compare-in">+{diff.added}</b> <b className="compare-out">−{diff.removed}</b>
                  </>
                ) : null}
              </span>
              <span className="compare-tools">
                <button className="btn" onClick={() => setReversed(!reversed)} title={t.compare.swapTitle}>
                  ⇄ {t.compare.swap}
                </button>
                {(diff.added > 0 || diff.removed > 0) && (
                  <button className="btn" onClick={() => void copy()}>
                    {copied ? t.common.copied : t.compare.copy}
                  </button>
                )}
              </span>
            </div>
            <div className="compare-body">
              {diff.added === 0 && diff.removed === 0 ? (
                <p className="text-dim">{t.compare.same}</p>
              ) : (
                diff.zones
                  .filter((z) => z.changes.length)
                  .map((zone) => (
                    <section key={zone.zoneId} className="compare-zone">
                      <h3>
                        {zoneLabel(zone.label)}{' '}
                        <span className="text-dim">
                          {zone.fromCount} → {zone.toCount}
                        </span>
                      </h3>
                      <ul>
                        {zone.changes.map((c) => (
                          <li key={c.name} className={c.to > c.from ? 'compare-add' : 'compare-remove'}>
                            <b>
                              {c.to > c.from ? '+' : '−'}
                              {Math.abs(c.to - c.from)}
                            </b>
                            {c.card?.imageUrlSmall ? <img src={c.card.imageUrlSmall} alt="" loading="lazy" /> : null}
                            <span className="compare-name">{c.name}</span>
                            <span className="text-dim">
                              {c.from} → {c.to}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))
              )}
            </div>
          </>
        )}
        {!diff && source === 'paste' && text.trim() && <p className="text-dim">{t.compare.noCards(adapter.shortName)}</p>}
      </div>
    </div>,
    document.body,
  )
}
