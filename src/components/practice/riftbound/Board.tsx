import { useEffect, useMemo, useRef, useState } from 'react'
import { applyTool, bfName, canMove, canPlay, endTurn, legalTargets, pass, playChoices, startOfTurn, move as moveUnits, mulligan, play, type GameState, type Side, type Tool, type Unit } from '../../../shared/practice/riftbound'
import { describeEffect, scriptOf, type Effect } from '../../../shared/practice/riftboundEffects'
import type { Card } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { CardDetailModal } from '../../CardDetailModal'

import { CardFace, GameLog, HandMenu, PlayerBar, UnitChip, Base, UnitTools, ZonesWindow } from './BoardParts'

/** A card whose text the game doesn't run but that points at things: you may mark what it targets. */
function wantsMarks(card: Card): boolean {
  return !scriptOf(card).full && /\b(choose|units?|gear)\b/i.test(card.text ?? '')
}

/** Moves the picked units, fighting as they arrive. */
function movePicked(game: GameState, ids: string[], to: 'base' | number): GameState {
  return canMove(game, 0, ids, to) ? moveUnits(game, 0, ids, to) : game
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
  // On a phone the log would take half the screen: it starts closed there.
  const [showLog, setShowLog] = useState(() => typeof matchMedia !== 'function' || !matchMedia('(max-width: 720px)').matches)
  const [zones, setZones] = useState<'deck' | 'trash' | null>(null)
  /** A card being played that needs units picked for its effects: what's been picked so far. */
  const [targeting, setTargeting] = useState<{ handIndex: number; options: { accelerate?: boolean; battlefield?: number }; effects: Effect[]; picks: (string | null)[] } | null>(null)
  /** A card being played whose text is yours to apply: the units you've marked as its targets. */
  const [marking, setMarking] = useState<{ handIndex: number; options: { accelerate?: boolean; battlefield?: number }; marked: string[] } | null>(null)
  const showdown = game.showdown
  const chain = game.chain?.items.length ? game.chain : null
  const yourTurn = game.phase === 'main' && game.active === 0 && !busy && !showdown && !chain
  /** You may play cards: priority on the chain, a showdown waiting on you, or your turn. */
  const yourMove = game.phase === 'main' && !busy && (chain ? chain.priority === 0 : showdown ? showdown.focus === 0 : game.active === 0)
  /** Units the cards on the chain point at. */
  const aimed = (chain?.items ?? []).flatMap((i) => [...i.targets, ...i.marked]).filter((id): id is string => !!id)
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
  // While marking, any unit can be clicked.
  const legalNow = targetEffect && 'target' in targetEffect ? legalTargets(game, 0, targetEffect.target, targetHere) : marking ? units : []
  const shownSelected = marking ? marking.marked : selected

  // On the chain with nothing you could answer with: pass by yourself (once per state, so Undo
  // back to it lets you look).
  const autoPassed = useRef(new WeakSet<GameState>())
  const me = game.players[0]
  const canAnswer = !!chain && chain.priority === 0 && [...me.hand, ...(me.champion ? [me.champion] : [])].some((c) => canPlay(game, 0, c))
  const mustPass = !!chain && chain.priority === 0 && !busy && game.phase === 'main' && !canAnswer && !targeting && !marking
  useEffect(() => {
    if (!mustPass || autoPassed.current.has(game)) return
    const timer = setTimeout(() => {
      autoPassed.current.add(game)
      act(pass(game, 0))
    }, 900)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mustPass])
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
    const choices = card && !options.free ? playChoices(card) : []
    if (choices.length) {
      setTargeting({ handIndex, options, effects: choices, picks: [] })
      setHandPick(null)
    } else if (card && !options.free && wantsMarks(card) && canPlay(game, 0, card, options.accelerate)) {
      setMarking({ handIndex, options, marked: [] })
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
    if (marking) {
      setMarking({ ...marking, marked: marking.marked.includes(u.uid) ? marking.marked.filter((id) => id !== u.uid) : [...marking.marked, u.uid] })
      return
    }
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
      {marking && (
        <div className="rb-prompt" role="status">
          <span>{t.practiceGame.markPrompt((marking.handIndex === -1 ? me.champion : me.hand[marking.handIndex])?.name ?? '')}</span>
          <button
            className="btn btn-primary"
            onClick={() => {
              const m = marking
              setMarking(null)
              act(play(game, 0, m.handIndex, { ...m.options, marked: m.marked }))
            }}
          >
            {t.practiceGame.markPlay}
          </button>
          <button className="btn" onClick={() => setMarking(null)}>
            {t.common.cancel}
          </button>
        </div>
      )}
      {chain && (
        <div className="rb-prompt rb-chain" role="region" aria-label={t.practiceGame.chainTitle}>
          <strong>{t.practiceGame.chainTitle}</strong>
          <ol className="rb-chain-items">
            {[...chain.items].reverse().map((item) => {
              const names = [...item.targets, ...item.marked]
                .map((id) => units.find((u) => u.uid === id)?.card.name)
                .filter(Boolean)
                .join(', ')
              return (
                <li key={item.uid} className={item.side === 0 ? 'mine' : 'theirs'}>
                  <button className="rb-chain-card" onClick={() => setDetail(item.card)} aria-label={t.practiceGame.details(item.card.name)}>
                    <CardFace card={item.card} />
                  </button>
                  <span>
                    {t.practiceGame.chainCard(item.side === 0 ? t.practiceGame.chainYou : (opponentName ?? t.practiceGame.chainThem), item.card.name)}
                    {names && <span className="text-dim"> {t.practiceGame.chainTargets(names)}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
          <span role="status">{chain.priority === 0 ? t.practiceGame.chainYours : opponentName ? t.practiceGame.chainFriend(opponentName) : t.practiceGame.chainBot}</span>
          <button className="btn btn-primary" disabled={chain.priority !== 0 || busy} onClick={() => act(pass(game, 0))}>
            {t.practiceGame.chainPass}
          </button>
        </div>
      )}
      {showdown && !chain && (
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
          {!goldfish && <Base game={game} side={1} selected={shownSelected} targetable={legalNow.map((u) => u.uid)} aimed={aimed} onUnit={toggle} onDetail={setDetail} opponentName={opponentName} />}

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
                    <UnitChip key={u.uid} unit={u} targetable={legalNow.some((x) => x.uid === u.uid)} aimed={aimed.includes(u.uid)} selected={shownSelected.includes(u.uid)} onClick={() => toggle(u)} onDetail={() => setDetail(u.card)} />
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
                    <UnitChip key={u.uid} unit={u} drag={dragProps({ kind: 'unit', uid: u.uid })} targetable={legalNow.some((x) => x.uid === u.uid)} aimed={aimed.includes(u.uid)} selected={shownSelected.includes(u.uid)} onClick={() => toggle(u)} onDetail={() => setDetail(u.card)} />
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
            selected={shownSelected}
            targetable={legalNow.map((u) => u.uid)}
            aimed={aimed}
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
