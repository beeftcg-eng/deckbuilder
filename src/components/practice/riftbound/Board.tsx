import { useMemo, useState } from 'react'
import { applyTool, bfName, canMove, canPlay, endTurn, legalTargets, pass, playChoices, startOfTurn, move as moveUnits, mulligan, play, type GameState, type Side, type Tool, type Unit } from '../../../shared/practice/riftbound'
import { describeEffect, type Effect } from '../../../shared/practice/riftboundEffects'
import type { Card } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { CardDetailModal } from '../../CardDetailModal'

import { CardFace, GameLog, HandMenu, PlayerBar, UnitChip, Base, UnitTools, ZonesWindow } from './BoardParts'

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
