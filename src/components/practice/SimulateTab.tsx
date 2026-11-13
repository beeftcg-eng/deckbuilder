import { useMemo, useState } from 'react'
import { simulateDeck } from '../../shared/practiceSim'
import type { Card, GameId } from '../../shared/types'
import { t } from '../../shared/i18n'

const pct = (p: number) => `${Math.round(p * 100)}%`

/** Practice's Simulate tab (practiceSim.ts): the deck played 2,000 times by a simple plan, and how its curve came out. */
export function SimulateTab({ gameId, cards, handSize, onThePlay }: { gameId: GameId; cards: Card[]; handSize: number; onThePlay: boolean }) {
  const [run, setRun] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => simulateDeck(gameId, cards, { handSize, onThePlay }), [gameId, cards, handSize, onThePlay, run])
  if (!result) return <p className="text-dim">{t.sampleHand.simNone}</p>
  const showMissed = result.turns.some((r) => r.missedResource != null)
  const showUsed = result.turns.some((r) => r.used != null)
  return (
    <div className="practice-sim">
      <p className="text-dim">{t.sampleHand.simIntro(result.games)}</p>
      <table className="odds-table sim-table">
        <thead>
          <tr>
            <th scope="col">{t.sampleHand.simTurn}</th>
            <th scope="col">{t.sampleHand.simHadPlay}</th>
            {showUsed && <th scope="col">{t.sampleHand.simUsed(gameId)}</th>}
            {showMissed && <th scope="col">{t.sampleHand.simMissed(gameId)}</th>}
            <th scope="col">{t.sampleHand.simHand}</th>
          </tr>
        </thead>
        <tbody>
          {result.turns.map((r) => (
            <tr key={r.turn}>
              <th scope="row">{t.sampleHand.turn(r.turn)}</th>
              <td>{pct(r.hadPlay)}</td>
              {showUsed && <td>{r.used == null ? '–' : pct(r.used)}</td>}
              {showMissed && <td>{r.missedResource == null ? '–' : pct(r.missedResource)}</td>}
              <td>{r.handSize.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={result.slowStart > 0.2 ? 'sync-error' : 'text-dim'}>{t.sampleHand.simSlow(pct(result.slowStart))}</p>
      <h3 className="sim-heading">{t.sampleHand.simCards(result.turns.length)}</h3>
      <ul className="odds-cards sim-cards">
        {result.cards.map((c) => (
          <li key={c.card.id}>
            <span className="odds-copies">{c.copies}×</span>
            <span className="odds-name">{c.card.name}</span>
            <span className="text-dim">
              {c.averageTurn == null ? t.sampleHand.simNever : t.sampleHand.simAvgTurn(c.averageTurn.toFixed(1), pct(c.played))}
            </span>
          </li>
        ))}
      </ul>
      <div className="sample-hand-actions">
        <button className="btn" onClick={() => setRun((n) => n + 1)}>
          {t.sampleHand.simAgain}
        </button>
        <span className="text-dim">{t.sampleHand.simNote}</span>
      </div>
    </div>
  )
}
