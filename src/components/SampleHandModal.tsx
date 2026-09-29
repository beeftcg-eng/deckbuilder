import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card, Deck } from '../shared/types'
import { cardsSeenBy, chanceAtLeast, expandZone, shuffled } from '../shared/sampleHand'
import { poolKey } from '../shared/collection'
import { t } from '../shared/i18n'

interface Props {
  deck: Deck
  cardsById: Map<string, Card>
  handSize: number
  onClose: () => void
}

type Tab = 'practice' | 'odds'
const TURNS = [0, 1, 2, 3, 4, 5]

function deal(from: Card[], size: number, mulligans: number) {
  const library = shuffled(from)
  return { hand: library.slice(0, size), library: library.slice(size), discard: [] as Card[], turn: 0, mulligans, bottomed: 0 }
}

type TapAction = 'discard' | 'bottom'

/**
 * Practising the deck: deal an opening hand, mulligan, put cards on the bottom (Magic's London
 * mulligan, Riftbound's replace-up-to-two), play turns out draw by draw - and the exact odds of
 * seeing chosen cards by each turn.
 */
export function SampleHandModal({ deck, cardsById, handSize, onClose }: Props) {
  const cards = useMemo(() => expandZone(deck, 'main', cardsById), [deck, cardsById])
  const [tab, setTab] = useState<Tab>('practice')
  const [onThePlay, setOnThePlay] = useState(true)
  const [state, setState] = useState(() => deal(cards, handSize, 0))
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [atLeast, setAtLeast] = useState(1)
  const [tapAction, setTapAction] = useState<TapAction>('discard')

  function draw() {
    setState((s) => ({ ...s, hand: [...s.hand, ...s.library.slice(0, 1)], library: s.library.slice(1) }))
  }

  function nextTurn() {
    setState((s) => {
      const turn = s.turn + 1
      const draws = turn === 1 && onThePlay ? 0 : 1
      return { ...s, turn, hand: [...s.hand, ...s.library.slice(0, draws)], library: s.library.slice(draws) }
    })
  }

  function bottom(index: number) {
    setState((s) => ({ ...s, hand: s.hand.filter((_, i) => i !== index), library: [...s.library, s.hand[index]], bottomed: s.bottomed + 1 }))
  }

  function discard(index: number) {
    setState((s) => ({ ...s, hand: s.hand.filter((_, i) => i !== index), discard: [...s.discard, s.hand[index]] }))
  }

  /** A discarded card back to the hand (a mis-tap, or an effect that returns it). */
  function recover(index: number) {
    setState((s) => ({ ...s, discard: s.discard.filter((_, i) => i !== index), hand: [...s.hand, s.discard[index]] }))
  }

  // One row per card (printings together), for the odds.
  const kinds = useMemo(() => {
    const byKey = new Map<string, { card: Card; copies: number }>()
    for (const card of cards) {
      const key = poolKey(card)
      const entry = byKey.get(key)
      if (entry) entry.copies++
      else byKey.set(key, { card, copies: 1 })
    }
    return [...byKey.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.copies - a.copies || a.card.name.localeCompare(b.card.name))
  }, [cards])
  const pickedCopies = kinds.filter((k) => picked.has(k.key)).reduce((n, k) => n + k.copies, 0)

  function togglePick(key: string) {
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const percent = (p: number) => `${(p * 100).toFixed(p >= 0.995 || p < 0.005 ? 0 : 1)}%`

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sample-hand-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.sampleHand.title(deck.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="text-dim">{t.sampleHand.empty}</div>
        ) : (
          <>
            <div className="practice-tabs" role="tablist">
              {(['practice', 'odds'] as const).map((tb) => (
                <button key={tb} role="tab" aria-selected={tab === tb} className={`btn ${tab === tb ? 'btn-primary' : ''}`} onClick={() => setTab(tb)}>
                  {tb === 'practice' ? t.sampleHand.practiceTab : t.sampleHand.oddsTab}
                </button>
              ))}
              <label className="practice-play" title={t.sampleHand.onThePlayTitle}>
                <input type="checkbox" checked={onThePlay} onChange={(e) => setOnThePlay(e.target.checked)} />
                {t.sampleHand.onThePlay}
              </label>
            </div>

            {tab === 'practice' ? (
              <>
                <div className="sample-hand-actions">
                  <button className="btn btn-primary" onClick={() => setState(deal(cards, handSize, 0))}>
                    {t.sampleHand.newHand(handSize)}
                  </button>
                  <button className="btn" onClick={() => setState(deal(cards, handSize, state.mulligans + 1))}>
                    {t.sampleHand.mulligan}
                  </button>
                  <button className="btn" disabled={state.library.length === 0} onClick={nextTurn}>
                    {t.sampleHand.nextTurn}
                  </button>
                  <button className="btn" disabled={state.library.length === 0} onClick={draw}>
                    {t.sampleHand.draw}
                  </button>
                </div>
                <div className="text-dim practice-status">
                  {state.turn === 0 ? t.sampleHand.opening : t.sampleHand.turn(state.turn)}
                  {' · '}
                  {t.sampleHand.status(state.hand.length, state.library.length)}
                  {state.mulligans > 0 && ` · ${t.sampleHand.mulligans(state.mulligans)}`}
                  {state.bottomed > 0 && ` · ${t.sampleHand.bottomed(state.bottomed)}`}
                  {state.discard.length > 0 && ` · ${t.sampleHand.discarded(state.discard.length)}`}
                </div>
                <div className="practice-tap" role="group" aria-label={t.sampleHand.tapLabel}>
                  <span className="text-dim">{t.sampleHand.tapLabel}</span>
                  {(['discard', 'bottom'] as const).map((a) => (
                    <button key={a} className={`btn ${tapAction === a ? 'btn-primary' : ''}`} aria-pressed={tapAction === a} onClick={() => setTapAction(a)}>
                      {a === 'discard' ? t.sampleHand.tapDiscard : t.sampleHand.tapBottom}
                    </button>
                  ))}
                </div>
                <div className="sample-hand-grid">
                  {state.hand.map((card, i) => (
                    <button
                      className="sample-hand-card"
                      key={`${card.id}-${i}`}
                      title={tapAction === 'discard' ? t.sampleHand.discardTitle(card.name) : t.sampleHand.bottomTitle(card.name)}
                      onClick={() => (tapAction === 'discard' ? discard(i) : bottom(i))}
                    >
                      {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt={card.name} /> : <div className="card-tile-placeholder">{card.name}</div>}
                    </button>
                  ))}
                </div>
                {state.discard.length > 0 && (
                  <div className="practice-discard">
                    <div className="text-dim">{t.sampleHand.discardPile(state.discard.length)}</div>
                    <div className="practice-discard-row">
                      {state.discard.map((card, i) => (
                        <button className="practice-discard-card" key={`${card.id}-d${i}`} title={t.sampleHand.recoverTitle(card.name)} onClick={() => recover(i)}>
                          {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt={card.name} /> : <span>{card.name}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="odds">
                <div className="odds-controls">
                  <label>
                    {t.sampleHand.atLeast}{' '}
                    <select value={atLeast} onChange={(e) => setAtLeast(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="text-dim">{picked.size ? t.sampleHand.pickedCopies(pickedCopies, cards.length) : t.sampleHand.pickCards}</span>
                </div>
                {picked.size > 0 && (
                  <table className="odds-table">
                    <tbody>
                      {TURNS.map((turn) => (
                        <tr key={turn}>
                          <th>{turn === 0 ? t.sampleHand.opening : t.sampleHand.byTurn(turn)}</th>
                          <td>{percent(chanceAtLeast(cards.length, pickedCopies, cardsSeenBy(handSize, turn, onThePlay), atLeast))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <ul className="odds-cards">
                  {kinds.map((k) => (
                    <li key={k.key}>
                      <label>
                        <input type="checkbox" checked={picked.has(k.key)} onChange={() => togglePick(k.key)} />
                        <span className="odds-copies">{k.copies}×</span>
                        <span className="odds-name">{k.card.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-dim odds-note">{t.sampleHand.oddsNote}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
