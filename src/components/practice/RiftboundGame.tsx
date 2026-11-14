import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useCardsById } from '../../state/useAppStore'
import { useCommunityLists } from '../../state/communityLists'
import { communityGame } from '../../shared/communityGames'
import { legendMeta, listDeck } from '../../shared/communityMeta'
import {
  applyTool,
  bfName,
  canMove,
  canPlay,
  combatMight,
  mightNow,
  costOf,
  endTurn,
  isUnit,
  keywordsOf,
  legalTargets,
  pass,
  playChoices,
  startOfTurn,
  move as moveUnits,
  mulligan,
  newGame,
  play,
  runeCount,
  type GameState,
  type Side,
  type Tool,
  type Unit,
} from '../../shared/practice/riftbound'
import { BOT, botAct, botMulligan, botShouldAct, setupFromDeck, type Level } from '../../shared/practice/riftboundBot'
import { describeEffect, scriptOf, type Effect } from '../../shared/practice/riftboundEffects'
import { DOMAIN_COLORS } from '../../lib/domainColors'
import type { Card, Deck } from '../../shared/types'
import { t } from '../../shared/i18n'
import { Modal } from '../Modal'
import { CardDetailModal } from '../CardDetailModal'

/** How long each of the bot's moves stays on screen before the next. */
const BOT_STEP_MS = 650
const HISTORY = 60

type Opponent = { kind: 'none' } | { kind: 'legend'; legendId: string }

/**
 * A Riftbound practice game (shared/practice/riftbound.ts) on a real board: against nobody, or
 * against the bot playing a recent Community list (riftboundBot.ts). You play your side by hand.
 * The game runs turns, paying, moves, showdowns, combat and scoring, and the card text it can read;
 * anything else is yours to apply with the tools on a selected unit or the side bars.
 */
export function RiftboundGame({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const cardsById = useCardsById('riftbound')
  const [game, setGame] = useState<GameState | null>(null)
  const [history, setHistory] = useState<GameState[]>([])
  const [botRunning, setBotRunning] = useState(false)
  const [level, setLevel] = useState<Level>('normal')

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  /**
   * Shows a new state; while the bot has a move (its turn, or a showdown waiting on it), it makes
   * them one at a time, stopping when a showdown waits on you.
   */
  function show(next: GameState, botLevel = level) {
    setGame(next)
    const bots = !next.players[BOT].empty && botShouldAct(next, BOT)
    setBotRunning(bots)
    if (!bots) return
    timers.current.push(setTimeout(() => show(botAct(next, BOT, botLevel), botLevel), BOT_STEP_MS))
  }

  function update(next: GameState) {
    if (!game || next === game) return
    setHistory((h) => [...h, game].slice(-HISTORY))
    show(next)
  }

  if (!game) {
    return (
      <Setup
        deck={deck}
        cardsById={cardsById}
        onStart={(g, l) => {
          setLevel(l)
          show(g, l)
        }}
        onClose={onClose}
      />
    )
  }

  return (
    <Modal label={t.practiceGame.title(deck.name)} className="rb-game-modal" onClose={onClose}>
      <Board
        game={game}
        busy={botRunning}
        canUndo={history.length > 0 && !botRunning}
        onUndo={() => {
          setGame(history[history.length - 1])
          setHistory((h) => h.slice(0, -1))
        }}
        onChange={update}
        onRestart={() => {
          setGame(null)
          setHistory([])
        }}
        onClose={onClose}
      />
    </Modal>
  )
}

// ---------- choosing the opponent ----------

function Setup({ deck, cardsById, onStart, onClose }: { deck: Deck; cardsById: Map<string, Card>; onStart: (g: GameState, level: Level) => void; onClose: () => void }) {
  const { lists } = useCommunityLists('riftbound', true)
  const legends = useMemo(() => legendMeta(lists ?? []).slice(0, 30), [lists])
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'none' })
  const [first, setFirst] = useState<'random' | 'me' | 'them'>('random')
  const [level, setLevel] = useState<Level>('normal')
  const [manual, setManual] = useState(true)
  const mine = useMemo(() => setupFromDeck(deck, cardsById), [deck, cardsById])
  // How many of the deck's different cards the game runs by itself.
  const coverage = useMemo(() => {
    const distinct = [...new Map([...mine.main, ...(mine.champion ? [mine.champion] : [])].map((c) => [c.name, c])).values()]
    return { auto: distinct.filter((c) => scriptOf(c).full).length, total: distinct.length }
  }, [mine])
  const noMight = useMemo(() => mine.main.filter(isUnit).length > 0 && mine.main.filter(isUnit).every((c) => c.might == null), [mine])
  const problems = [
    !mine.legend && t.practiceGame.needLegend,
    mine.main.length + (mine.champion ? 1 : 0) < 20 && t.practiceGame.needCards,
    mine.runes.length === 0 && t.practiceGame.needRunes,
  ].filter(Boolean) as string[]

  function start() {
    let them = null
    if (opponent.kind === 'legend' && lists) {
      const index = communityGame('riftbound').index(cardsById.values())
      // A random recent list with that Legend.
      const pool = lists.filter((l) => l.legendId === opponent.legendId)
      for (const list of [...pool].sort(() => Math.random() - 0.5)) {
        const d = listDeck(list, index)
        if (d) {
          them = setupFromDeck(d, cardsById)
          break
        }
      }
    }
    let g = newGame(mine, them, { first: first === 'me' ? 0 : first === 'them' ? 1 : undefined, manual })
    if (them) g = botMulligan(g)
    onStart(g, level)
  }

  return (
    <Modal label={t.practiceGame.setupTitle} className="rb-setup-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{t.practiceGame.setupTitle}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      <p className="text-dim">{t.practiceGame.intro}</p>
      {problems.length > 0 ? (
        <ul className="sync-error">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <>
          <label className="rb-setup-row">
            <span>{t.practiceGame.opponent}</span>
            <select
              value={opponent.kind === 'none' ? '' : opponent.legendId}
              onChange={(e) => setOpponent(e.target.value ? { kind: 'legend', legendId: e.target.value } : { kind: 'none' })}
            >
              <option value="">{t.practiceGame.nobody}</option>
              {legends.map((m) => (
                <option key={m.legendId} value={m.legendId}>
                  {t.practiceGame.botWith(m.legendName, m.lists)}
                </option>
              ))}
            </select>
          </label>
          {!lists && <p className="text-dim">{t.communityLists.loading}</p>}
          {opponent.kind !== 'none' && (
            <label className="rb-setup-row">
              <span>{t.practiceGame.goesFirst}</span>
              <select value={first} onChange={(e) => setFirst(e.target.value as typeof first)}>
                <option value="random">{t.practiceGame.firstRandom}</option>
                <option value="me">{t.practiceGame.firstMe}</option>
                <option value="them">{t.practiceGame.firstThem}</option>
              </select>
            </label>
          )}
          {opponent.kind !== 'none' && (
            <label className="rb-setup-row">
              <span>{t.practiceGame.level}</span>
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                <option value="easy">{t.practiceGame.easy}</option>
                <option value="normal">{t.practiceGame.normal}</option>
                <option value="hard">{t.practiceGame.hard}</option>
              </select>
            </label>
          )}
          <label className="rb-setup-row">
            <span>{t.practiceGame.rules}</span>
            <select value={manual ? 'manual' : 'auto'} onChange={(e) => setManual(e.target.value === 'manual')}>
              <option value="manual">{t.practiceGame.rulesManual}</option>
              <option value="auto">{t.practiceGame.rulesAuto}</option>
            </select>
          </label>
          <p className="text-dim">{manual ? t.practiceGame.manualHelp : t.practiceGame.coverage(coverage.auto, coverage.total)}</p>
          {noMight && <p className="text-dim">{t.practiceGame.noMight}</p>}
          <p className="text-dim">{opponent.kind === 'none' ? t.practiceGame.nobodyHelp : t.practiceGame.botHelp}</p>
          <div className="announcement-actions">
            <button className="btn btn-primary" onClick={start}>
              {t.practiceGame.start}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ---------- the board ----------

interface BoardProps {
  game: GameState
  busy: boolean
  canUndo: boolean
  onUndo: () => void
  onChange: (g: GameState) => void
  onRestart: () => void
  onClose: () => void
}

function Board({ game, busy, canUndo, onUndo, onChange, onRestart, onClose }: BoardProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [handPick, setHandPick] = useState<number | null>(null)
  const [mulliganPick, setMulliganPick] = useState<number[]>([])
  const [detail, setDetail] = useState<Card | null>(null)
  const [showLog, setShowLog] = useState(true)
  /** A card being played that needs units picked for its effects: what's been picked so far. */
  const [targeting, setTargeting] = useState<{ handIndex: number; options: { accelerate?: boolean; battlefield?: number }; effects: Effect[]; picks: (string | null)[] } | null>(null)
  const showdown = game.showdown
  const yourTurn = game.phase === 'main' && game.active === 0 && !busy && !showdown
  /** You may play cards: your turn, or a showdown waiting on you. */
  const yourMove = game.phase === 'main' && !busy && (showdown ? showdown.focus === 0 : game.active === 0)
  const goldfish = game.players[1].empty
  /** You play your side by hand (the setup's Manual): turn steps, fights, control and points are yours. */
  const manual = game.manual.includes(0)
  const units = useMemo(() => [...game.players[0].base, ...game.players[1].base, ...game.battlefields.flatMap((b) => b.units)], [game])
  const selectedUnits = units.filter((u) => selected.includes(u.uid))
  const mineSelected = selectedUnits.filter((u) => u.owner === 0)

  function act(next: GameState) {
    onChange(next)
    setSelected((ids) => ids.filter((id) => [...next.players[0].base, ...next.players[1].base, ...next.battlefields.flatMap((b) => b.units)].some((u) => u.uid === id)))
    setHandPick(null)
  }
  const tool = (tl: Tool) => act(applyTool(game, tl))
  const targetEffect = targeting ? targeting.effects[targeting.picks.length] : undefined
  const targetHere = targeting?.options.battlefield ?? showdown?.battlefield ?? null
  const legalNow = targetEffect && 'target' in targetEffect ? legalTargets(game, 0, targetEffect.target, targetHere) : []
  function pick(id: string | null) {
    if (!targeting) return
    const picks = [...targeting.picks, id]
    if (picks.length < targeting.effects.length) setTargeting({ ...targeting, picks })
    else {
      setTargeting(null)
      act(play(game, 0, targeting.handIndex, { ...targeting.options, targets: picks }))
    }
  }
  /** Plays a card; one whose effects need units picked asks for them first. */
  function playCard(handIndex: number, options: { accelerate?: boolean; battlefield?: number; free?: boolean }) {
    const card = handIndex === -1 ? game.players[0].champion : game.players[0].hand[handIndex]
    const choices = card && !options.free && !manual ? playChoices(card) : []
    if (choices.length) {
      setTargeting({ handIndex, options, effects: choices, picks: [] })
      setHandPick(null)
    } else act(play(game, 0, handIndex, options))
  }
  const toggle = (u: Unit) => {
    if (targeting) {
      if (legalNow.some((x) => x.uid === u.uid)) pick(u.uid)
      return
    }
    setSelected((ids) => (ids.includes(u.uid) ? ids.filter((id) => id !== u.uid) : [...ids, u.uid]))
  }

  const moveTo = (to: 'base' | number) => act(movePicked(game, mineSelected.map((u) => u.uid), to))

  if (game.phase === 'mulligan') {
    const hand = game.players[0].hand
    return (
      <>
        <div className="modal-header">
          <span>{t.practiceGame.mulliganTitle}</span>
        </div>
        <p className="text-dim">{t.practiceGame.mulliganHelp}</p>
        <div className="rb-hand">
          {hand.map((card, i) => (
            <button
              key={i}
              className={`rb-hand-card ${mulliganPick.includes(i) ? 'picked' : ''}`}
              aria-pressed={mulliganPick.includes(i)}
              onClick={() => setMulliganPick((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < 2 ? [...p, i] : p))}
            >
              <CardFace card={card} />
            </button>
          ))}
        </div>
        <div className="announcement-actions">
          <button className="btn btn-primary" onClick={() => onChange(mulligan(game, 0, mulliganPick))}>
            {mulliganPick.length ? t.practiceGame.mulliganN(mulliganPick.length) : t.practiceGame.keep}
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="rb-board">
      <div className="rb-topbar">
        <strong>{game.phase === 'over' ? (game.winner === 0 ? t.practiceGame.youWin : t.practiceGame.theyWin) : busy || game.active === 1 ? t.practiceGame.theirTurn(game.turn) : t.practiceGame.yourTurn(game.turn)}</strong>
        <span className="rb-score" aria-label={t.practiceGame.scoreLabel(game.players[0].points, game.players[1].points)}>
          {goldfish ? t.practiceGame.points(game.players[0].points) : `${game.players[0].points} – ${game.players[1].points}`}
        </span>
        <span className="rb-topbar-actions">
          <button className="btn" disabled={!canUndo} onClick={onUndo}>
            {t.practiceGame.undo}
          </button>
          <button className="btn" onClick={() => setShowLog((v) => !v)} aria-pressed={showLog}>
            {t.practiceGame.log}
          </button>
          <button className="btn" onClick={onRestart}>
            {t.practiceGame.newGame}
          </button>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
          <button className="btn btn-primary" disabled={!yourTurn} onClick={() => act(endTurn(game))}>
            {t.practiceGame.endTurn}
          </button>
        </span>
      </div>

      {targeting && targetEffect && (
        <div className="rb-prompt" role="status">
          <span>{t.practiceGame.choose(describeEffect(targetEffect))}</span>
          {!legalNow.length && <span className="text-dim">{t.practiceGame.noTargets}</span>}
          <button className="btn" onClick={() => pick(null)}>
            {t.practiceGame.skip}
          </button>
          <button className="btn" onClick={() => setTargeting(null)}>
            {t.common.cancel}
          </button>
        </div>
      )}
      {showdown && (
        <div className="rb-prompt rb-showdown" role="status">
          <span>
            {t.practiceGame.showdown(bfName(game, showdown.battlefield))}{' '}
            {showdown.focus === 0 ? t.practiceGame.yourAnswer : t.practiceGame.theirAnswer}
          </span>
          <button className="btn btn-primary" disabled={showdown.focus !== 0 || busy} onClick={() => act(pass(game, 0))}>
            {t.practiceGame.pass}
          </button>
        </div>
      )}
      <div className={`rb-main ${showLog ? 'with-log' : ''}`}>
        <div className="rb-field">
          {!goldfish && <PlayerBar game={game} side={1} onTool={tool} />}
          {!goldfish && <Base game={game} side={1} selected={selected} targetable={legalNow.map((u) => u.uid)} onUnit={toggle} onDetail={setDetail} />}

          <div className="rb-battlefields">
            {game.battlefields.map((bf, i) => (
              <section key={i} className={`rb-bf ${bf.controller === 0 ? 'mine' : bf.controller === 1 ? 'theirs' : ''}`} aria-label={bfName(game, i)}>
                <header>
                  <button className="rb-bf-art" onClick={() => bf.card && setDetail(bf.card)} aria-label={t.practiceGame.details(bfName(game, i))}>
                    {bf.card?.imageUrlSmall && <img src={bf.card.imageUrlSmall} alt="" loading="lazy" />}
                    <span>{bfName(game, i)}</span>
                  </button>
                  {manual ? (
                    <select
                      aria-label={t.practiceGame.controlLabel(bfName(game, i))}
                      value={bf.controller == null ? '' : String(bf.controller)}
                      onChange={(e) => tool({ kind: 'control', battlefield: i, side: e.target.value === '' ? null : (Number(e.target.value) as Side) })}
                    >
                      <option value="">{t.practiceGame.uncontrolled}</option>
                      <option value="0">{t.practiceGame.yours}</option>
                      {!goldfish && <option value="1">{t.practiceGame.theirs}</option>}
                    </select>
                  ) : (
                    <span className="text-dim">{bf.controller == null ? t.practiceGame.uncontrolled : bf.controller === 0 ? t.practiceGame.yours : t.practiceGame.theirs}</span>
                  )}
                </header>
                <div className="rb-units theirs">
                  {bf.units.filter((u) => u.owner === 1).map((u) => (
                    <UnitChip key={u.uid} unit={u} targetable={legalNow.some((x) => x.uid === u.uid)} selected={selected.includes(u.uid)} onClick={() => toggle(u)} onDetail={() => setDetail(u.card)} />
                  ))}
                </div>
                <div className="rb-units mine">
                  {bf.units.filter((u) => u.owner === 0).map((u) => (
                    <UnitChip key={u.uid} unit={u} targetable={legalNow.some((x) => x.uid === u.uid)} selected={selected.includes(u.uid)} onClick={() => toggle(u)} onDetail={() => setDetail(u.card)} />
                  ))}
                </div>
                {mineSelected.length > 0 && yourTurn && (
                  <button className="btn btn-primary rb-move-here" disabled={!canMove(game, 0, mineSelected.map((u) => u.uid), i)} onClick={() => moveTo(i)}>
                    {t.practiceGame.moveHere(mineSelected.length)}
                  </button>
                )}
              </section>
            ))}
          </div>

          <Base game={game} side={0} selected={selected} targetable={legalNow.map((u) => u.uid)} onUnit={toggle} onDetail={setDetail} />
          {mineSelected.length > 0 && yourTurn && (
            <button className="btn rb-move-base" disabled={!canMove(game, 0, mineSelected.map((u) => u.uid), 'base')} onClick={() => moveTo('base')}>
              {t.practiceGame.moveBase}
            </button>
          )}
          <PlayerBar game={game} side={0} onTool={tool} onPlayChampion={yourTurn ? () => playCard(-1, {}) : undefined} onStartOfTurn={manual && yourTurn ? () => act(startOfTurn(game, 0)) : undefined} />

          {selectedUnits.length === 1 && <UnitTools unit={selectedUnits[0]} onTool={tool} onDone={() => setSelected([])} />}

          <div className="rb-hand" aria-label={t.practiceGame.hand}>
            {game.players[0].hand.map((card, i) => (
              <div key={`${card.id}-${i}`} className="rb-hand-slot">
                <button
                  className={`rb-hand-card ${yourMove && !canPlay(game, 0, card) ? 'unaffordable' : ''} ${handPick === i ? 'picked' : ''}`}
                  aria-expanded={handPick === i}
                  onClick={() => setHandPick(handPick === i ? null : i)}
                >
                  <CardFace card={card} />
                </button>
                {handPick === i && (
                  <HandMenu
                    game={game}
                    card={card}
                    yourTurn={yourMove}
                    onPlay={(options) => playCard(i, options)}
                    onDiscard={() => tool({ kind: 'discard', side: 0, handIndex: i })}
                    onDetail={() => setDetail(card)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {showLog && <GameLog game={game} onDetail={setDetail} />}
      </div>
      {detail && <CardDetailModal card={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

/** Moves the picked units, fighting as they arrive. */
function movePicked(game: GameState, ids: string[], to: 'base' | number): GameState {
  return canMove(game, 0, ids, to) ? moveUnits(game, 0, ids, to) : game
}


function CardFace({ card }: { card: Card }) {
  return card.imageUrlSmall ? <img src={card.imageUrlSmall} alt={card.name} loading="lazy" /> : <span className="rb-card-name">{card.name}</span>
}

function UnitChip({ unit, selected, targetable, onClick, onDetail }: { unit: Unit; selected: boolean; targetable?: boolean; onClick: () => void; onDetail: () => void }) {
  const might = mightNow(unit)
  const kw = unit.keywords
  const tags = [kw.tank && 'Tank', kw.assault && `Assault ${kw.assault}`, kw.shield && `Shield ${kw.shield}`, kw.ganking && 'Ganking', kw.backline && 'Backline', kw.temporary && 'Temporary', unit.stunned && t.practiceGame.stunned, unit.buffed && t.practiceGame.buffed, unit.temp !== 0 && t.practiceGame.thisTurn(unit.temp)]
    .filter(Boolean)
    .join(' · ')
  const color = DOMAIN_COLORS[unit.card.colors[0]] ?? 'var(--accent)'
  const name = unit.card.name.replace(/\s*\([^)]*\)$/, '')
  return (
    <div className={`rb-unit ${unit.exhausted ? 'exhausted' : ''} ${selected ? 'selected' : ''} ${targetable ? 'targetable' : ''} ${unit.owner === 0 ? 'mine' : 'theirs'}`} style={{ '--domain-a': color } as CSSProperties}>
      <button
        className="rb-unit-main"
        aria-pressed={selected}
        aria-label={`${name}, ${might} Might${unit.damage ? `, ${unit.damage} damage` : ''}, ${unit.exhausted ? t.practiceGame.exhausted : t.practiceGame.ready}${tags ? `, ${tags}` : ''}`}
        onClick={onClick}
        title={unit.card.text ?? undefined}
      >
        <span className="rb-unit-art">
          {unit.card.imageUrlSmall ? <img src={unit.card.imageUrlSmall} alt="" loading="lazy" /> : <span className="rb-unit-noart">{name}</span>}
          <span className="rb-unit-might" aria-hidden>
            {might}
          </span>
          {unit.damage > 0 && (
            <span className="rb-unit-damage" aria-hidden>
              −{unit.damage}
            </span>
          )}
        </span>
        <span className="rb-unit-name" aria-hidden>
          {name}
        </span>
        {tags && (
          <span className="rb-unit-state text-dim" aria-hidden>
            {tags}
          </span>
        )}
      </button>
      <button className="rb-unit-info" aria-label={t.practiceGame.details(unit.card.name)} onClick={onDetail}>
        ⓘ
      </button>
    </div>
  )
}

function Base({ game, side, selected, targetable, onUnit, onDetail }: { game: GameState; side: Side; selected: string[]; targetable: string[]; onUnit: (u: Unit) => void; onDetail: (c: Card) => void }) {
  const p = game.players[side]
  return (
    <section className={`rb-base ${side === 0 ? 'mine' : 'theirs'}`} aria-label={side === 0 ? t.practiceGame.yourBase : t.practiceGame.theirBase}>
      <span className="rb-zone-label text-dim">{side === 0 ? t.practiceGame.yourBase : t.practiceGame.theirBase}</span>
      <div className="rb-units">
        {p.base.map((u) => (
          <UnitChip key={u.uid} unit={u} targetable={targetable.includes(u.uid)} selected={selected.includes(u.uid)} onClick={() => onUnit(u)} onDetail={() => onDetail(u.card)} />
        ))}
        {p.gear.map((g) => (
          <button key={g.uid} className="rb-gear" onClick={() => onDetail(g.card)}>
            ⚙ {g.card.name}
          </button>
        ))}
        {!p.base.length && !p.gear.length && <span className="text-dim">{t.practiceGame.empty}</span>}
      </div>
    </section>
  )
}

function PlayerBar({ game, side, onTool, onPlayChampion, onStartOfTurn }: { game: GameState; side: Side; onTool: (tl: Tool) => void; onPlayChampion?: () => void; onStartOfTurn?: () => void }) {
  const p = game.players[side]
  const runes = runeCount(game, side)
  const champion = p.champion
  return (
    <div className={`rb-player ${side === 0 ? 'mine' : 'theirs'}`}>
      {p.legend?.imageUrlSmall && <img className="rb-legend-art" src={p.legend.imageUrlSmall} alt="" loading="lazy" />}
      <span className="rb-legend" title={p.legend?.text ?? undefined}>
        {p.legend?.name ?? '—'}
      </span>
      <span className="rb-points" aria-label={t.practiceGame.pointsLabel(p.points)}>
        ★ {p.points}
        {side === 0 && (
          <>
            <button className="btn stepper-btn" aria-label={t.practiceGame.pointMinus} onClick={() => onTool({ kind: 'points', side, amount: -1 })}>
              −
            </button>
            <button className="btn stepper-btn" aria-label={t.practiceGame.pointPlus} onClick={() => onTool({ kind: 'points', side, amount: 1 })}>
              +
            </button>
          </>
        )}
      </span>
      <span className="rb-runes" aria-label={t.practiceGame.runesLabel(runes.ready, runes.total)}>
        {p.runes.map((r) => (
          <span key={r.uid} className={`rb-rune ${r.exhausted ? 'exhausted' : ''}`} style={{ background: DOMAIN_COLORS[r.domain] ?? 'var(--accent)' }} title={r.domain} aria-hidden />
        ))}
        <span className="text-dim">
          {' '}
          {runes.ready}/{runes.total}
        </span>
      </span>
      <span className="text-dim rb-counts">{t.practiceGame.counts(p.hand.length, p.deck.length, p.trash.length)}</span>
      {champion && (
        <span className="rb-champion">
          {t.practiceGame.champion}: {champion.name}
          {onPlayChampion && (
            <button className="btn" disabled={!canPlay(game, side, champion)} onClick={onPlayChampion}>
              {t.practiceGame.play(costOf(champion).energy, costOf(champion).power)}
            </button>
          )}
        </span>
      )}
      {side === 0 && (
        <span className="rb-player-tools">
          {onStartOfTurn && (
            <button className="btn btn-primary" onClick={onStartOfTurn} title={t.practiceGame.startOfTurnTitle}>
              {t.practiceGame.startOfTurn}
            </button>
          )}
          {game.manual.includes(side) && (
            <button className="btn" onClick={() => onTool({ kind: 'readyAll', side })}>
              {t.practiceGame.readyAll}
            </button>
          )}
          <button className="btn" onClick={() => onTool({ kind: 'draw', side })}>
            {t.practiceGame.drawCard}
          </button>
          <button className="btn" onClick={() => onTool({ kind: 'channel', side })}>
            {t.practiceGame.channel}
          </button>
          <button className="btn" onClick={() => onTool({ kind: 'readyRune', side })}>
            {t.practiceGame.readyRune}
          </button>
        </span>
      )}
    </div>
  )
}

function HandMenu({ game, card, yourTurn, onPlay, onDiscard, onDetail }: { game: GameState; card: Card; yourTurn: boolean; onPlay: (o: { accelerate?: boolean; battlefield?: number; free?: boolean }) => void; onDiscard: () => void; onDetail: () => void }) {
  const { energy, power } = costOf(card)
  const accel = keywordsOf(card).accelerate && isUnit(card)
  return (
    <div className="rb-hand-menu" role="group" aria-label={card.name}>
      <button className="btn btn-primary" disabled={!yourTurn || !canPlay(game, 0, card)} onClick={() => onPlay({})}>
        {t.practiceGame.play(energy, power)}
      </button>
      {accel && (
        <button className="btn" disabled={!yourTurn || !canPlay(game, 0, card, true)} onClick={() => onPlay({ accelerate: true })}>
          {t.practiceGame.accelerate}
        </button>
      )}
      {isUnit(card) &&
        game.battlefields.map((bf, i) =>
          bf.controller === 0 ? (
            <button key={i} className="btn" disabled={!yourTurn || !canPlay(game, 0, card)} onClick={() => onPlay({ battlefield: i })}>
              {t.practiceGame.playTo(bfName(game, i))}
            </button>
          ) : null,
        )}
      <button className="btn" disabled={!yourTurn} onClick={() => onPlay({ free: true })} title={t.practiceGame.freeTitle}>
        {t.practiceGame.free}
      </button>
      <button className="btn" onClick={onDiscard}>
        {t.practiceGame.discard}
      </button>
      <button className="btn" onClick={onDetail}>
        {t.practiceGame.read}
      </button>
    </div>
  )
}

function UnitTools({ unit, onTool, onDone }: { unit: Unit; onTool: (tl: Tool) => void; onDone: () => void }) {
  const id = unit.uid
  return (
    <div className="rb-tools" role="group" aria-label={t.practiceGame.toolsFor(unit.card.name)}>
      <span className="text-dim">{t.practiceGame.toolsFor(unit.card.name)}</span>
      <button className="btn" onClick={() => onTool({ kind: 'damage', unit: id, amount: 1 })}>
        {t.practiceGame.damage}
      </button>
      <button className="btn" disabled={unit.damage <= 0} onClick={() => onTool({ kind: 'damage', unit: id, amount: -1 })}>
        {t.practiceGame.heal}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'buff', unit: id, amount: 1 })}>
        {t.practiceGame.mightUp}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'buff', unit: id, amount: -1 })}>
        {t.practiceGame.mightDown}
      </button>
      <button className="btn" onClick={() => onTool({ kind: unit.exhausted ? 'ready' : 'exhaust', unit: id })}>
        {unit.exhausted ? t.practiceGame.readyIt : t.practiceGame.exhaustIt}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'stun', unit: id })}>
        {t.practiceGame.stun}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'recall', unit: id })}>
        {t.practiceGame.recall}
      </button>
      <button className="btn" onClick={() => onTool({ kind: 'toHand', unit: id })}>
        {t.practiceGame.toHand}
      </button>
      <button
        className="btn"
        onClick={() => {
          onTool({ kind: 'kill', unit: id })
          onDone()
        }}
      >
        {t.practiceGame.kill}
      </button>
      <span className="text-dim">{t.practiceGame.mightNow(combatMight(unit, false) - unit.damage)}</span>
    </div>
  )
}

/** The game so far, oldest first, kept scrolled to the newest. */
function GameLog({ game, onDetail }: { game: GameState; onDetail: (c: Card) => void }) {
  const start = Math.max(0, game.log.length - 120)
  const entries = game.log.slice(start)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [game.log.length])
  return (
    <aside className="rb-log" ref={ref} aria-label={t.practiceGame.log} aria-live="polite">
      <ol>
        {entries.map((e, i) => (
          <li key={start + i} className={`rb-log-${e.kind} ${e.side === 0 ? 'mine' : 'theirs'}`}>
            {e.text}
            {e.card && e.kind === 'spell' && (
              <>
                {' '}
                <button className="link-button" onClick={() => onDetail(e.card!)}>
                  {t.practiceGame.read}
                </button>
                {e.card.text && <div className="rb-log-text">{e.card.text}</div>}
              </>
            )}
          </li>
        ))}
      </ol>
    </aside>
  )
}
