import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAppStore, useCardsById } from '../../state/useAppStore'
import { recordsFor } from '../../shared/practice/results'
import { PracticeRecord } from './PracticeRecord'
import { OnlineGame } from './OnlineGame'
import { packState, unpackState } from '../../shared/practice/serialize'
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

/** Who the bot plays: a random recent list for a Legend, one list, or one of your decks. */
type Opponent = { kind: 'none' } | { kind: 'legend'; legendId: string; listId: string | null } | { kind: 'deck'; deckId: string }

/** What a game is against, for its result. */
interface GameMeta {
  opponentId: string
  opponentName: string
  level: Level
  byHand: boolean
}

/** The game in progress for a deck, kept on this device to resume. */
const saveKey = (deckId: string) => `brewhouse.practice.riftbound.${deckId}`
const TIMELINE = 800

function readSave(deckId: string, cardsById: Map<string, Card>): { meta: GameMeta; state: GameState } | null {
  try {
    const raw = localStorage.getItem(saveKey(deckId))
    if (!raw) return null
    const { meta, state } = JSON.parse(raw) as { meta: GameMeta; state: string }
    const game = unpackState(state, cardsById)
    return game && meta ? { meta, state: game } : null
  } catch {
    return null
  }
}

function writeSave(deckId: string, meta: GameMeta, state: GameState | null) {
  try {
    if (!state || state.phase === 'over') localStorage.removeItem(saveKey(deckId))
    else localStorage.setItem(saveKey(deckId), JSON.stringify({ meta, state: packState(state) }))
  } catch {
    // storage full or blocked: the game just can't be resumed
  }
}

/**
 * A Riftbound practice game (shared/practice/riftbound.ts) on a real board: against nobody, or
 * against the bot playing a recent Community list or one of your decks (riftboundBot.ts). The game
 * in progress is saved on the device to resume; a finished one can be replayed step by step, and
 * its result counts toward your record with the deck (practice/results.ts).
 */
export function RiftboundGame({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const cardsById = useCardsById('riftbound')
  const addPracticeResult = useAppStore((s) => s.addPracticeResult)
  const [game, setGame] = useState<GameState | null>(null)
  const [meta, setMeta] = useState<GameMeta | null>(null)
  const [history, setHistory] = useState<GameState[]>([])
  const [botRunning, setBotRunning] = useState(false)
  /** Every state the game went through, for the replay. */
  const [timeline, setTimeline] = useState<GameState[]>([])
  const [replayAt, setReplayAt] = useState<number | null>(null)
  const [online, setOnline] = useState(false)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  /**
   * Shows a new state; while the bot has a move (its turn, or a showdown waiting on it), it makes
   * them one at a time, stopping when a showdown waits on you. Saves it, and records the result
   * when the game ends.
   */
  function show(next: GameState, m: GameMeta, previous: GameState | null) {
    setGame(next)
    setTimeline((t) => [...t, next].slice(-TIMELINE))
    writeSave(deck.id, m, next)
    if (next.phase === 'over' && previous?.phase !== 'over' && !next.players[BOT].empty && next.winner != null) {
      addPracticeResult({
        at: new Date().toISOString(),
        deckId: deck.id,
        opponentId: m.opponentId,
        opponentName: m.opponentName,
        won: next.winner === 0,
        points: [next.players[0].points, next.players[1].points],
        level: m.level,
        byHand: m.byHand,
      })
    }
    const bots = !next.players[BOT].empty && botShouldAct(next, BOT)
    setBotRunning(bots)
    if (!bots) return
    timers.current.push(setTimeout(() => show(botAct(next, BOT, m.level), m, next), BOT_STEP_MS))
  }

  function update(next: GameState) {
    if (!game || !meta || next === game) return
    setHistory((h) => [...h, game].slice(-HISTORY))
    show(next, meta, game)
  }

  function begin(g: GameState, m: GameMeta) {
    setMeta(m)
    setHistory([])
    setTimeline([])
    setReplayAt(null)
    show(g, m, null)
  }

  if (online) return <OnlineGame deck={deck} onClose={onClose} />
  if (!game || !meta) {
    return <Setup deck={deck} cardsById={cardsById} onStart={begin} onOnline={() => setOnline(true)} onClose={onClose} />
  }

  const replaying = replayAt != null
  return (
    <Modal label={t.practiceGame.title(deck.name)} className="rb-game-modal" onClose={onClose}>
      {replaying && (
        <div className="rb-prompt rb-replay" role="group" aria-label={t.practiceGame.replay}>
          <button className="btn" disabled={replayAt === 0} onClick={() => setReplayAt((i) => Math.max(0, (i ?? 0) - 1))} aria-label={t.practiceGame.replayBack}>
            ◀
          </button>
          <input
            type="range"
            min={0}
            max={timeline.length - 1}
            value={replayAt}
            aria-label={t.practiceGame.replayStep(replayAt + 1, timeline.length)}
            onChange={(e) => setReplayAt(Number(e.target.value))}
          />
          <button className="btn" disabled={replayAt >= timeline.length - 1} onClick={() => setReplayAt((i) => Math.min(timeline.length - 1, (i ?? 0) + 1))} aria-label={t.practiceGame.replayForward}>
            ▶
          </button>
          <span className="text-dim">{t.practiceGame.replayStep(replayAt + 1, timeline.length)}</span>
          <button className="btn" onClick={() => setReplayAt(null)}>
            {t.practiceGame.replayExit}
          </button>
        </div>
      )}
      <Board
        game={replaying ? timeline[replayAt] : game}
        busy={botRunning || replaying}
        canUndo={history.length > 0 && !botRunning && !replaying}
        onUndo={() => {
          const back = history[history.length - 1]
          setGame(back)
          setHistory((h) => h.slice(0, -1))
          writeSave(deck.id, meta, back)
        }}
        onChange={update}
        onReplay={game.phase === 'over' && timeline.length > 1 && !replaying ? () => setReplayAt(0) : undefined}
        onRestart={() => {
          writeSave(deck.id, meta, null)
          setGame(null)
          setMeta(null)
          setHistory([])
        }}
        onClose={onClose}
      />
    </Modal>
  )
}

// ---------- choosing the opponent ----------

function Setup({ deck, cardsById, onStart, onOnline, onClose }: { deck: Deck; cardsById: Map<string, Card>; onStart: (g: GameState, meta: GameMeta) => void; onOnline: () => void; onClose: () => void }) {
  const { lists } = useCommunityLists('riftbound', true)
  const legends = useMemo(() => legendMeta(lists ?? []).slice(0, 30), [lists])
  const myDecks = useAppStore((s) => s.decks).filter((d) => d.gameId === 'riftbound')
  const results = useAppStore((s) => s.settings.practiceResults)
  const records = useMemo(() => recordsFor(results, deck.id), [results, deck.id])
  const [opponent, setOpponent] = useState<Opponent>({ kind: 'none' })
  const [first, setFirst] = useState<'random' | 'me' | 'them'>('random')
  const [level, setLevel] = useState<Level>('normal')
  const [manual, setManual] = useState(true)
  const saved = useMemo(() => readSave(deck.id, cardsById), [deck.id, cardsById])
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
  const legendLists = opponent.kind === 'legend' ? (lists ?? []).filter((l) => l.legendId === opponent.legendId) : []
  const opponentId = opponent.kind === 'legend' ? opponent.legendId : opponent.kind === 'deck' ? `deck:${opponent.deckId}` : null
  const record = opponentId ? records.find((r) => r.opponentId === opponentId) : undefined

  function start() {
    let them = null
    let name = ''
    if (opponent.kind === 'legend' && lists) {
      const index = communityGame('riftbound').index(cardsById.values())
      const pool = opponent.listId ? legendLists.filter((l) => l.id === opponent.listId) : [...legendLists].sort(() => Math.random() - 0.5)
      for (const list of pool) {
        const d = listDeck(list, index)
        if (d) {
          them = setupFromDeck(d, cardsById)
          name = list.legendName
          break
        }
      }
    } else if (opponent.kind === 'deck') {
      const theirs = myDecks.find((d) => d.id === opponent.deckId)
      if (theirs) {
        them = setupFromDeck(theirs, cardsById)
        name = theirs.name
      }
    }
    let g = newGame(mine, them, { first: first === 'me' ? 0 : first === 'them' ? 1 : undefined, manual })
    if (them) g = botMulligan(g)
    onStart(g, { opponentId: them && opponentId ? opponentId : 'nobody', opponentName: them ? name : t.practiceGame.nobody, level, byHand: manual })
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
      {saved && (
        <div className="rb-prompt">
          <span>{t.practiceGame.resumeText(saved.meta.opponentName, saved.state.turn, saved.state.players[0].points, saved.state.players[1].points)}</span>
          <button className="btn btn-primary" onClick={() => onStart(saved.state, saved.meta)}>
            {t.practiceGame.resume}
          </button>
        </div>
      )}
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
              value={opponent.kind === 'none' ? '' : opponent.kind === 'legend' ? `legend:${opponent.legendId}` : `deck:${opponent.deckId}`}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'online') return onOnline()
                setOpponent(v.startsWith('legend:') ? { kind: 'legend', legendId: v.slice(7), listId: null } : v.startsWith('deck:') ? { kind: 'deck', deckId: v.slice(5) } : { kind: 'none' })
              }}
            >
              <option value="">{t.practiceGame.nobody}</option>
              <option value="online">{t.practiceGame.online}</option>
              {legends.length > 0 && (
                <optgroup label={t.practiceGame.botLists}>
                  {legends.map((m) => (
                    <option key={m.legendId} value={`legend:${m.legendId}`}>
                      {t.practiceGame.botWith(m.legendName, m.lists)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t.practiceGame.botDecks}>
                {myDecks.map((d) => (
                  <option key={d.id} value={`deck:${d.id}`}>
                    {d.id === deck.id ? t.practiceGame.mirror(d.name) : d.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {opponent.kind === 'legend' && legendLists.length > 0 && (
            <label className="rb-setup-row">
              <span>{t.practiceGame.whichList}</span>
              <select value={opponent.listId ?? ''} onChange={(e) => setOpponent({ ...opponent, listId: e.target.value || null })}>
                <option value="">{t.practiceGame.randomList}</option>
                {legendLists.slice(0, 40).map((l) => (
                  <option key={l.id} value={l.id}>
                    {[l.eventName, l.rank != null ? `#${l.rank}` : null, l.player].filter(Boolean).join(' · ')}
                  </option>
                ))}
              </select>
            </label>
          )}
          {record && <p className="rb-record">{t.practiceGame.recordAgainst(record.wins, record.losses)}</p>}
          {!lists && <p className="text-dim">{t.communityLists.loading}</p>}
          {opponent.kind !== 'none' && (
            <>
              <label className="rb-setup-row">
                <span>{t.practiceGame.goesFirst}</span>
                <select value={first} onChange={(e) => setFirst(e.target.value as typeof first)}>
                  <option value="random">{t.practiceGame.firstRandom}</option>
                  <option value="me">{t.practiceGame.firstMe}</option>
                  <option value="them">{t.practiceGame.firstThem}</option>
                </select>
              </label>
              <label className="rb-setup-row">
                <span>{t.practiceGame.level}</span>
                <select value={level} onChange={(e) => setLevel(e.target.value as Level)}>
                  <option value="easy">{t.practiceGame.easy}</option>
                  <option value="normal">{t.practiceGame.normal}</option>
                  <option value="hard">{t.practiceGame.hard}</option>
                </select>
              </label>
            </>
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
          {records.length > 0 && <PracticeRecord records={records} />}
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
  /** After the game: step through it again. */
  onReplay?: () => void
  /** Playing a friend online: their name, instead of "the bot". */
  opponentName?: string
  /** A line under the top bar (an online game's connection). */
  status?: string | null
  onRestart: () => void
  onClose: () => void
}

export function Board({ game, busy, canUndo, onUndo, onChange, onReplay, onRestart, onClose, opponentName, status }: BoardProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [handPick, setHandPick] = useState<number | null>(null)
  const [mulliganPick, setMulliganPick] = useState<number[]>([])
  const [detail, setDetail] = useState<Card | null>(null)
  const [showLog, setShowLog] = useState(true)
  const [zones, setZones] = useState<'deck' | 'trash' | null>(null)
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
  // ---------- drag and drop (desktop; on touch screens it's tap, then "Move here") ----------
  type Drag = { kind: 'hand'; index: number } | { kind: 'champion' } | { kind: 'unit'; uid: string }
  type Drop = { kind: 'base' } | { kind: 'bf'; index: number } | { kind: 'trash' }
  const [dropHover, setDropHover] = useState<string | null>(null)
  const DRAG_TYPE = 'application/x-brewhouse-rb'
  const dragProps = (payload: Drag) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => setDropHover(null),
  })
  const dropKey = (target: Drop) => (target.kind === 'bf' ? `bf${target.index}` : target.kind)
  const dropProps = (target: Drop) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      setDropHover(dropKey(target))
    },
    onDragLeave: () => setDropHover((h) => (h === dropKey(target) ? null : h)),
    onDrop: (e: React.DragEvent) => {
      const raw = e.dataTransfer.getData(DRAG_TYPE)
      setDropHover(null)
      if (!raw) return
      e.preventDefault()
      dropped(JSON.parse(raw) as Drag, target)
    },
  })
  const dropClass = (target: Drop) => (dropHover === dropKey(target) ? 'drop-hover' : '')
  function dropped(drag: Drag, target: Drop) {
    if (drag.kind === 'hand' || drag.kind === 'champion') {
      const index = drag.kind === 'hand' ? drag.index : -1
      if (target.kind === 'trash') {
        if (drag.kind === 'hand') tool({ kind: 'discard', side: 0, handIndex: index })
      } else if (yourMove) playCard(index, target.kind === 'bf' ? { battlefield: target.index } : {})
      return
    }
    if (target.kind === 'trash') return tool({ kind: 'kill', unit: drag.uid })
    // A unit that's part of the selection brings the whole selection along.
    const ids = selected.includes(drag.uid) ? mineSelected.map((u) => u.uid) : [drag.uid]
    const to = target.kind === 'base' ? 'base' : target.index
    if (canMove(game, 0, ids, to)) act(moveUnits(game, 0, ids, to))
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
        <strong>
          {game.phase === 'over'
            ? game.winner === 0
              ? t.practiceGame.youWin
              : opponentName
                ? t.practiceGame.friendWins(opponentName)
                : t.practiceGame.theyWin
            : busy || game.active === 1
              ? opponentName
                ? t.practiceGame.friendTurn(opponentName, game.turn)
                : t.practiceGame.theirTurn(game.turn)
              : t.practiceGame.yourTurn(game.turn)}
        </strong>
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
          {onReplay && (
            <button className="btn" onClick={onReplay}>
              {t.practiceGame.replay}
            </button>
          )}
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

      {status && <div className="rb-prompt rb-status" role="status">{status}</div>}
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
            {showdown.focus === 0 ? t.practiceGame.yourAnswer : opponentName ? t.practiceGame.friendAnswer(opponentName) : t.practiceGame.theirAnswer}
          </span>
          <button className="btn btn-primary" disabled={showdown.focus !== 0 || busy} onClick={() => act(pass(game, 0))}>
            {t.practiceGame.pass}
          </button>
        </div>
      )}
      <div className={`rb-main ${showLog ? 'with-log' : ''}`}>
        <div className="rb-field">
          {!goldfish && <PlayerBar game={game} side={1} onTool={tool} />}
          {!goldfish && <Base game={game} side={1} selected={selected} targetable={legalNow.map((u) => u.uid)} onUnit={toggle} onDetail={setDetail} opponentName={opponentName} />}

          <div className="rb-battlefields">
            {game.battlefields.map((bf, i) => (
              <section key={i} className={`rb-bf ${bf.controller === 0 ? 'mine' : bf.controller === 1 ? 'theirs' : ''} ${dropClass({ kind: 'bf', index: i })}`} aria-label={bfName(game, i)} {...dropProps({ kind: 'bf', index: i })}>
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
                {bf.hidden.length > 0 && (
                  <div className="rb-hidden">
                    {bf.hidden.map((h) =>
                      h.owner === 0 ? (
                        <span key={h.uid} className="rb-hidden-card mine">
                          🂠 {h.card.name}
                          <button className="btn stepper-btn" onClick={() => tool({ kind: 'unhide', battlefield: i, hidden: h.uid })}>
                            {t.practiceGame.reveal}
                          </button>
                        </span>
                      ) : (
                        <span key={h.uid} className="rb-hidden-card">
                          🂠 {t.practiceGame.faceDown}
                        </span>
                      ),
                    )}
                  </div>
                )}
                <div className="rb-units mine">
                  {bf.units.filter((u) => u.owner === 0).map((u) => (
                    <UnitChip key={u.uid} unit={u} drag={dragProps({ kind: 'unit', uid: u.uid })} targetable={legalNow.some((x) => x.uid === u.uid)} selected={selected.includes(u.uid)} onClick={() => toggle(u)} onDetail={() => setDetail(u.card)} />
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

          <Base
            game={game}
            side={0}
            selected={selected}
            targetable={legalNow.map((u) => u.uid)}
            onUnit={toggle}
            onDetail={setDetail}
            onTool={tool}
            dragFor={(u) => dragProps({ kind: 'unit', uid: u.uid })}
            drop={{ ...dropProps({ kind: 'base' }), className: dropClass({ kind: 'base' }) }}
          />
          {mineSelected.length > 0 && yourTurn && (
            <button className="btn rb-move-base" disabled={!canMove(game, 0, mineSelected.map((u) => u.uid), 'base')} onClick={() => moveTo('base')}>
              {t.practiceGame.moveBase}
            </button>
          )}
          <PlayerBar
            game={game}
            side={0}
            onTool={tool}
            onPlayChampion={yourTurn ? () => playCard(-1, {}) : undefined}
            onStartOfTurn={manual && yourTurn ? () => act(startOfTurn(game, 0)) : undefined}
            onZones={setZones}
            championDrag={dragProps({ kind: 'champion' })}
            trashDrop={{ ...dropProps({ kind: 'trash' }), className: dropClass({ kind: 'trash' }) }}
          />

          {selectedUnits.length === 1 && <UnitTools unit={selectedUnits[0]} onTool={tool} onDone={() => setSelected([])} />}

          <p className="text-dim desktop-only rb-drag-hint">{t.practiceGame.dragHint}</p>
          <div className="rb-hand" aria-label={t.practiceGame.hand}>
            {game.players[0].hand.map((card, i) => (
              <div key={`${card.id}-${i}`} className="rb-hand-slot">
                <button
                  {...dragProps({ kind: 'hand', index: i })}
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
                    onHide={(bfIndex) => tool({ kind: 'hide', side: 0, handIndex: i, battlefield: bfIndex })}
                    manual={manual}
                    onDetail={() => setDetail(card)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {showLog && <GameLog game={game} onDetail={setDetail} />}
      </div>
      {zones && <ZonesWindow game={game} kind={zones} onTool={tool} onDetail={setDetail} onClose={() => setZones(null)} />}
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

/** What a draggable thing gets: draggable, and its drag start and end. */
type DragProps = { draggable: boolean; onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void }
/** What a drop zone gets: its drag handlers and a class while something hovers. */
type DropProps = { onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void; className: string }

function UnitChip({ unit, selected, targetable, drag, onClick, onDetail }: { unit: Unit; selected: boolean; targetable?: boolean; drag?: DragProps; onClick: () => void; onDetail: () => void }) {
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
        {...drag}
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

function Base({
  game,
  side,
  selected,
  targetable,
  onUnit,
  onDetail,
  onTool,
  dragFor,
  drop,
  opponentName,
}: {
  game: GameState
  side: Side
  selected: string[]
  targetable: string[]
  onUnit: (u: Unit) => void
  onDetail: (c: Card) => void
  onTool?: (tl: Tool) => void
  dragFor?: (u: Unit) => DragProps
  drop?: DropProps
  opponentName?: string
}) {
  const p = game.players[side]
  const { className: dropClassName = '', ...dropHandlers } = drop ?? { className: '' }
  const theirLabel = opponentName ? t.practiceGame.friendBase(opponentName) : t.practiceGame.theirBase
  return (
    <section className={`rb-base ${side === 0 ? 'mine' : 'theirs'} ${dropClassName}`} aria-label={side === 0 ? t.practiceGame.yourBase : theirLabel} {...dropHandlers}>
      <span className="rb-zone-label text-dim">{side === 0 ? t.practiceGame.yourBase : theirLabel}</span>
      <div className="rb-units">
        {p.base.map((u) => (
          <UnitChip key={u.uid} unit={u} drag={dragFor?.(u)} targetable={targetable.includes(u.uid)} selected={selected.includes(u.uid)} onClick={() => onUnit(u)} onDetail={() => onDetail(u.card)} />
        ))}
        {p.gear.map((g) => (
          <span key={g.uid} className={`rb-gear ${g.exhausted ? 'exhausted' : ''}`}>
            {onTool ? (
              <button className="link-button" aria-pressed={g.exhausted} title={t.practiceGame.exhaustToggle} onClick={() => onTool({ kind: 'gear', side, gear: g.uid })}>
                ⚙ {g.card.name}
                {g.exhausted ? ` · ${t.practiceGame.exhausted}` : ''}
              </button>
            ) : (
              <span>⚙ {g.card.name}</span>
            )}
            <button className="rb-unit-info" aria-label={t.practiceGame.details(g.card.name)} onClick={() => onDetail(g.card)}>
              ⓘ
            </button>
          </span>
        ))}
        {!p.base.length && !p.gear.length && <span className="text-dim">{t.practiceGame.empty}</span>}
      </div>
    </section>
  )
}

function PlayerBar({
  game,
  side,
  onTool,
  onPlayChampion,
  onStartOfTurn,
  onZones,
  championDrag,
  trashDrop,
}: {
  game: GameState
  side: Side
  onTool: (tl: Tool) => void
  onPlayChampion?: () => void
  onStartOfTurn?: () => void
  onZones?: (kind: 'deck' | 'trash') => void
  championDrag?: DragProps
  trashDrop?: DropProps
}) {
  const p = game.players[side]
  const runes = runeCount(game, side)
  const champion = p.champion
  const [makingToken, setMakingToken] = useState(false)
  const { className: trashClass = '', ...trashHandlers } = trashDrop ?? { className: '' }
  return (
    <div className={`rb-player ${side === 0 ? 'mine' : 'theirs'}`}>
      {p.legend?.imageUrlSmall && <img className={`rb-legend-art ${p.legendExhausted ? 'exhausted' : ''}`} src={p.legend.imageUrlSmall} alt="" loading="lazy" />}
      {side === 0 ? (
        <button className="link-button rb-legend" aria-pressed={p.legendExhausted} title={`${t.practiceGame.legendToggle}${p.legend?.text ? `\n\n${p.legend.text}` : ''}`} onClick={() => onTool({ kind: 'legend', side })}>
          {p.legend?.name ?? '—'}
          {p.legendExhausted ? ` · ${t.practiceGame.exhausted}` : ''}
        </button>
      ) : (
        <span className="rb-legend" title={p.legend?.text ?? undefined}>
          {p.legend?.name ?? '—'}
          {p.legendExhausted ? ` · ${t.practiceGame.exhausted}` : ''}
        </span>
      )}
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
      {onZones && (
        <>
          <button className="btn" onClick={() => onZones('deck')}>
            {t.practiceGame.deckButton}
          </button>
          <button className={`btn rb-trash ${trashClass}`} onClick={() => onZones('trash')} title={t.practiceGame.trashDropTitle} {...trashHandlers}>
            {t.practiceGame.trashButton(p.trash.length)}
          </button>
        </>
      )}
      {champion && (
        <span className="rb-champion" {...championDrag}>
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
          <button className="btn" aria-expanded={makingToken} onClick={() => setMakingToken((v) => !v)}>
            {t.practiceGame.makeToken}
          </button>
        </span>
      )}
      {makingToken && (
        <TokenForm
          game={game}
          onMake={(tl) => {
            onTool(tl)
            setMakingToken(false)
          }}
        />
      )}
    </div>
  )
}

/** Makes a unit token of any Might, in base or at a battlefield. */
function TokenForm({ game, onMake }: { game: GameState; onMake: (tl: Tool) => void }) {
  const [name, setName] = useState('')
  const [might, setMight] = useState(1)
  const [where, setWhere] = useState('base')
  const [ready, setReady] = useState(false)
  return (
    <form
      className="rb-token-form"
      onSubmit={(e) => {
        e.preventDefault()
        onMake({ kind: 'token', side: 0, name, might, battlefield: where === 'base' ? null : Number(where), ready })
      }}
    >
      <input aria-label={t.practiceGame.tokenName} placeholder={t.practiceGame.tokenName} value={name} onChange={(e) => setName(e.target.value)} />
      <label>
        {t.practiceGame.tokenMight}{' '}
        <input type="number" min={0} max={20} value={might} onChange={(e) => setMight(Number(e.target.value))} />
      </label>
      <select aria-label={t.practiceGame.tokenWhere} value={where} onChange={(e) => setWhere(e.target.value)}>
        <option value="base">{t.practiceGame.yourBase}</option>
        {game.battlefields.map((_, i) => (
          <option key={i} value={i}>
            {bfName(game, i)}
          </option>
        ))}
      </select>
      <label>
        <input type="checkbox" checked={ready} onChange={(e) => setReady(e.target.checked)} /> {t.practiceGame.ready}
      </label>
      <button className="btn btn-primary" type="submit">
        {t.practiceGame.make}
      </button>
    </form>
  )
}

/** Your deck (the top cards, or all of it) and trash, to take cards from like at a table. */
function ZonesWindow({ game, kind, onTool, onDetail, onClose }: { game: GameState; kind: 'deck' | 'trash'; onTool: (tl: Tool) => void; onDetail: (c: Card) => void; onClose: () => void }) {
  const [top, setTop] = useState(3)
  const [all, setAll] = useState(false)
  const p = game.players[0]
  const cards = kind === 'trash' ? p.trash : all ? p.deck : p.deck.slice(0, top)
  const title = kind === 'trash' ? t.practiceGame.trashTitle(p.trash.length) : t.practiceGame.deckTitle(p.deck.length)
  return (
    <Modal label={title} className="rb-zones-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{title}</span>
        <button className="btn" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
      {kind === 'deck' && (
        <div className="rb-zones-controls">
          <label>
            {t.practiceGame.lookAtTop}{' '}
            <select value={all ? 'all' : String(top)} onChange={(e) => (e.target.value === 'all' ? setAll(true) : (setAll(false), setTop(Number(e.target.value))))}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="all">{t.practiceGame.wholeDeck}</option>
            </select>
          </label>
          <button className="btn" onClick={() => onTool({ kind: 'shuffle', side: 0 })}>
            {t.practiceGame.shuffle}
          </button>
        </div>
      )}
      {!cards.length && <p className="text-dim">{t.practiceGame.empty}</p>}
      <ul className="rb-zones-list">
        {cards.map((card, i) => (
          <li key={`${card.id}-${i}`}>
            <button className="rb-zone-card" onClick={() => onDetail(card)} aria-label={t.practiceGame.details(card.name)}>
              <CardFace card={card} />
            </button>
            <span className="rb-zone-actions">
              {kind === 'deck' ? (
                <>
                  <button className="btn" onClick={() => onTool({ kind: 'fromDeck', side: 0, index: i, to: 'hand' })}>
                    {t.practiceGame.toHand}
                  </button>
                  <button className="btn" onClick={() => onTool({ kind: 'fromDeck', side: 0, index: i, to: 'bottom' })}>
                    {t.practiceGame.toBottom}
                  </button>
                  <button className="btn" onClick={() => onTool({ kind: 'fromDeck', side: 0, index: i, to: 'trash' })}>
                    {t.practiceGame.toTrash}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn" onClick={() => onTool({ kind: 'fromTrash', side: 0, index: i, to: 'hand' })}>
                    {t.practiceGame.toHand}
                  </button>
                  <button className="btn" onClick={() => onTool({ kind: 'fromTrash', side: 0, index: i, to: 'bottom' })}>
                    {t.practiceGame.toBottom}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function HandMenu({
  game,
  card,
  yourTurn,
  manual,
  onPlay,
  onDiscard,
  onHide,
  onDetail,
}: {
  game: GameState
  card: Card
  yourTurn: boolean
  manual: boolean
  onPlay: (o: { accelerate?: boolean; battlefield?: number; free?: boolean }) => void
  onDiscard: () => void
  onHide: (battlefield: number) => void
  onDetail: () => void
}) {
  const hidden = /\[hidden\]/i.test(card.text ?? '')
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
          bf.controller === 0 || manual ? (
            <button key={i} className="btn" disabled={!yourTurn || !canPlay(game, 0, card)} onClick={() => onPlay({ battlefield: i })}>
              {t.practiceGame.playTo(bfName(game, i))}
            </button>
          ) : null,
        )}
      <button className="btn" disabled={!yourTurn} onClick={() => onPlay({ free: true })} title={t.practiceGame.freeTitle}>
        {t.practiceGame.free}
      </button>
      {(hidden || manual) &&
        game.battlefields.map((bf, i) =>
          bf.controller === 0 || manual ? (
            <button key={`h${i}`} className="btn" onClick={() => onHide(i)} title={t.practiceGame.hideTitle}>
              {t.practiceGame.hideAt(bfName(game, i))}
            </button>
          ) : null,
        )}
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
