import { useMemo, useState } from 'react'
import { newGame, type GameState } from '../../../shared/practice/riftbound'
import { botMulligan, setupFromDeck } from '../../../shared/practice/riftboundBot'
import { openBattlefields, swap, swapCounts, swapped, withBattlefields, type DeckLists } from '../../../shared/practice/riftboundMatch'
import type { Card, Deck, DeckCardEntry } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { Modal } from '../../Modal'
import { CardDetailModal } from '../../CardDetailModal'
import type { GameMeta } from './saves'

/** Your battlefield for the game, by its picture (or at random, when `random` is offered). */
export function BattlefieldPick({ cards, value, onChange, random = true }: { cards: Card[]; value: string | null; onChange: (id: string | null) => void; random?: boolean }) {
  const distinct = [...new Map(cards.map((c) => [c.id, c])).values()]
  if (!distinct.length) return null
  return (
    <div className="rb-bf-pick" role="group" aria-label={t.practiceGame.battlefieldPick}>
      <span>{t.practiceGame.battlefieldPick}</span>
      <div className="rb-bf-pick-row">
        {random && (
          <button className={`rb-bf-pick-card ${value == null ? 'picked' : ''}`} aria-pressed={value == null} onClick={() => onChange(null)}>
            <span className="rb-bf-pick-random">?</span>
            <span>{t.practiceGame.battlefieldRandom}</span>
          </button>
        )}
        {distinct.map((c) => (
          <button key={c.id} className={`rb-bf-pick-card ${value === c.id ? 'picked' : ''}`} aria-pressed={value === c.id} onClick={() => onChange(c.id)}>
            {c.imageUrlSmall ? <img src={c.imageUrlSmall} alt="" loading="lazy" /> : <span className="rb-bf-pick-random">⛰</span>}
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Card entries as rows by name, for the sideboarding lists. */
function rows(entries: DeckCardEntry[] | undefined, cardsById: Map<string, Card>) {
  return (entries ?? [])
    .map((e) => ({ id: e.cardId, n: e.quantity, name: cardsById.get(e.cardId)?.name ?? e.cardId, card: cardsById.get(e.cardId) }))
    .filter((r) => r.n > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

type Swaps = { out: Record<string, number>; in: Record<string, number> }

/** Sideboarding: swap cards between the main deck and the sideboard, one for one (with the cards' pictures). */
export function Sideboarding({ deck, cardsById, swaps, onSwaps }: { deck: DeckLists; cardsById: Map<string, Card>; swaps: Swaps; onSwaps: (s: Swaps) => void }) {
  const [detail, setDetail] = useState<Card | null>(null)
  const lists = useMemo(() => swapped(deck, swaps), [deck, swaps])
  const counts = swapCounts(swaps)
  const main = rows(lists.zones.main, cardsById)
  const side = rows(lists.zones.sideboard, cardsById)
  /** A row's card: its picture, and the full card on a click. */
  const face = (r: { name: string; card?: Card }) => (
    <button className="rb-sb-card" onClick={() => r.card && setDetail(r.card)} aria-label={t.practiceGame.details(r.name)}>
      {r.card?.imageUrlSmall && <img src={r.card.imageUrlSmall} alt="" loading="lazy" />}
    </button>
  )
  function move(id: string, dir: 'out' | 'in') {
    const next = swap(deck, swaps, id, dir)
    if (next) onSwaps(next)
  }
  return (
    <section className="rb-sideboarding" aria-label={t.practiceGame.sideboarding}>
      <h3>{t.practiceGame.sideboarding}</h3>
      {!side.length && !counts.out ? (
        <p className="text-dim">{t.practiceGame.noSideboard}</p>
      ) : (
        <>
          <p className="text-dim">{t.practiceGame.sideboardHelp}</p>
          <div className="rb-sideboard-cols">
            <div>
              <h4>{t.practiceGame.mainDeckN(main.reduce((n, r) => n + r.n, 0))}</h4>
              <ul aria-label={t.practiceGame.mainDeckN(main.reduce((n, r) => n + r.n, 0))}>
                {main.map((r) => (
                  <li key={r.id} className={swaps.in[r.id] ? 'swapped' : ''}>
                    {face(r)}
                    <span>
                      {r.n}× {r.name}
                    </span>
                    <button className="btn stepper-btn" onClick={() => move(r.id, 'out')} aria-label={`${t.practiceGame.swapOut}: ${r.name}`}>
                      {t.practiceGame.swapOut} →
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>{t.practiceGame.sideboardN(side.reduce((n, r) => n + r.n, 0))}</h4>
              <ul aria-label={t.practiceGame.sideboardN(side.reduce((n, r) => n + r.n, 0))}>
                {side.map((r) => (
                  <li key={r.id} className={swaps.out[r.id] ? 'swapped' : ''}>
                    <button className="btn stepper-btn" onClick={() => move(r.id, 'in')} aria-label={`${t.practiceGame.swapIn}: ${r.name}`}>
                      ← {t.practiceGame.swapIn}
                    </button>
                    {face(r)}
                    <span>
                      {r.n}× {r.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {counts.out !== counts.in && <p className="sync-error">{t.practiceGame.swapUneven(counts.out, counts.in)}</p>}
          {(counts.out > 0 || counts.in > 0) && (
            <button className="btn" onClick={() => onSwaps({ out: {}, in: {} })}>
              {t.practiceGame.resetSwaps}
            </button>
          )}
        </>
      )}
      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </section>
  )
}

/**
 * Between the games of a match: the score, sideboarding (one for one, for the rest of the match),
 * your battlefield (not one you've played this match), and who goes first (the loser chooses; the
 * bot always goes first when it lost).
 */
export function BetweenGames({ deck, cardsById, meta, lastWinner, onStart, onClose }: { deck: Deck; cardsById: Map<string, Card>; meta: GameMeta; lastWinner: 0 | 1; onStart: (g: GameState, meta: GameMeta) => void; onClose: () => void }) {
  const m = meta.match!
  const [swaps, setSwaps] = useState<Swaps>({ out: m.out, in: m.in })
  const lists = useMemo(() => swapped(deck, swaps), [deck, swaps])
  const mine = useMemo(() => setupFromDeck(lists, cardsById), [lists, cardsById])
  const open = openBattlefields(mine.battlefields, m, 0)
  const [bf, setBf] = useState<string | null>(open[0]?.id ?? null)
  const [first, setFirst] = useState<'me' | 'them'>('me')
  const counts = swapCounts(swaps)
  const even = counts.out === counts.in
  const gameNo = m.wins[0] + m.wins[1] + 1
  const youChoose = lastWinner === 1

  function start() {
    const them = m.bot ? setupFromDeck(m.bot, cardsById) : null
    const botOpen = them ? openBattlefields(them.battlefields, m, 1) : []
    const chosen = open.find((c) => c.id === bf) ?? open[Math.floor(Math.random() * open.length)] ?? null
    let g = newGame({ ...mine, chosen }, them && { ...them, chosen: botOpen[Math.floor(Math.random() * botOpen.length)] ?? null }, {
      first: youChoose ? (first === 'me' ? 0 : 1) : 1,
      manual: meta.byHand,
    })
    if (them) g = botMulligan(g)
    const played = withBattlefields({ ...m, out: swaps.out, in: swaps.in }, g.battlefields[0]?.card?.id ?? null, g.battlefields[1]?.card?.id ?? null)
    onStart(g, { ...meta, match: played })
  }

  return (
    <Modal label={t.practiceGame.betweenTitle(gameNo)} className="rb-setup-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{t.practiceGame.betweenTitle(gameNo)}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      <p>
        <strong>{t.practiceGame.betweenScore(m.wins[0], m.wins[1])}</strong> {youChoose ? t.practiceGame.loserChooses : t.practiceGame.botGoesFirst}
      </p>
      {youChoose && (
        <label className="rb-setup-row">
          <span>{t.practiceGame.goesFirst}</span>
          <select value={first} onChange={(e) => setFirst(e.target.value as 'me' | 'them')}>
            <option value="me">{t.practiceGame.firstMe}</option>
            <option value="them">{t.practiceGame.firstThem}</option>
          </select>
        </label>
      )}
      <BattlefieldPick cards={open} value={bf} onChange={setBf} random={false} />
      <p className="text-dim">{t.practiceGame.battlefieldUsedHelp}</p>
      <Sideboarding deck={deck} cardsById={cardsById} swaps={swaps} onSwaps={setSwaps} />
      <div className="announcement-actions">
        <button className="btn btn-primary" disabled={!even} onClick={start}>
          {t.practiceGame.startGameN(gameNo)}
        </button>
      </div>
    </Modal>
  )
}
