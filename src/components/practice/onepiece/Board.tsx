import { useState } from 'react'
import {
  applyTool,
  attack,
  attackTargets,
  block,
  blockers,
  canAttackWith,
  canCounter,
  canPlay,
  choose,
  costOf,
  counter,
  endTurn,
  findPiece,
  giveDon,
  isCharacter,
  isLeader,
  isStage,
  MAX_CHARACTERS,
  mulligan,
  play,
  powerNow,
  resolveBattle,
  resolveTrigger,
  toMove,
  type GameState,
  type Piece,
  type Side,
  type Tool,
} from '../../../shared/practice/onepiece'
import { describeEffect } from '../../../shared/practice/onepieceEffects'
import { counterValue } from '../../../shared/practice/onepieceBot'
import type { Card } from '../../../shared/types'
import { t } from '../../../shared/i18n'
import { GameLog } from '../riftbound/BoardParts'

const shortName = (card: Card) => card.name.replace(/\s*\([^)]*\)$/, '')

/**
 * The One Piece board (onepiece.ts runs the rules): the bot's side on top, yours below, your hand
 * pinned to the bottom. Click one of your cards to attack with it or give it DON!!; click any card on
 * the field for the tools that do card text by hand.
 */
export function Board({
  game,
  busy,
  opponentName,
  canUndo,
  onUndo,
  onChange,
  onRestart,
  onReplay,
  onClose,
}: {
  game: GameState
  busy: boolean
  opponentName: string
  canUndo: boolean
  onUndo: () => void
  onChange: (g: GameState) => void
  onRestart: () => void
  onReplay?: () => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [aiming, setAiming] = useState(false)
  const [handPick, setHandPick] = useState<number | null>(null)
  const [replacing, setReplacing] = useState<number | null>(null)
  const [showLog, setShowLog] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(max-width: 720px)').matches)
  const [trashOpen, setTrashOpen] = useState(false)

  const me = game.players[0]
  const them = game.players[1]
  const goldfish = them.empty
  const mover = toMove(game)
  const yourMove = !busy && mover === 0
  const yourTurn = yourMove && game.phase === 'main' && game.active === 0 && !game.battle && game.choices.length === 0
  const choice = game.choices[0]
  const yourChoice = yourMove && choice?.side === 0 ? choice : null
  const defending = yourMove && game.battle && game.battle.side === 1 && game.choices.length === 0 ? game.battle : null
  const piece = selected ? findPiece(game, selected) : null

  function act(next: GameState) {
    if (next === game) return
    setHandPick(null)
    setReplacing(null)
    setAiming(false)
    if (selected && !findPiece(next, selected)) setSelected(null)
    onChange(next)
  }
  const tool = (tl: Tool) => act(applyTool(game, tl))

  const targetsNow = new Set<string>([
    ...(yourChoice?.kind === 'target' ? yourChoice.legal : []),
    ...(aiming && selected ? attackTargets(game, 0) : []),
    ...(defending?.step === 'block' ? blockers(game).map((b) => b.uid) : []),
    ...(replacing != null ? me.characters.map((c) => c.uid) : []),
  ])

  function clickPiece(p: Piece) {
    if (yourChoice?.kind === 'target' && yourChoice.legal.includes(p.uid)) return act(choose(game, 0, p.uid))
    if (aiming && selected && attackTargets(game, 0).includes(p.uid)) return act(attack(game, 0, selected, p.uid))
    if (defending?.step === 'block' && blockers(game).some((b) => b.uid === p.uid)) return act(block(game, 0, p.uid))
    if (replacing != null && p.owner === 0 && me.characters.some((c) => c.uid === p.uid)) return act(play(game, 0, replacing, { replace: p.uid }))
    setAiming(false)
    setSelected(selected === p.uid ? null : p.uid)
  }

  function playCard(i: number) {
    const card = me.hand[i]
    if (isCharacter(card) && me.characters.length >= MAX_CHARACTERS) {
      setReplacing(i)
      setHandPick(null)
      return
    }
    act(play(game, 0, i))
  }

  const battle = game.battle
  const battleText = battle
    ? (() => {
        const a = findPiece(game, battle.attacker)
        const d = findPiece(game, battle.target)
        return a && d ? t.opGame.battle(shortName(a.card), powerNow(game, a), shortName(d.card), powerNow(game, d)) : ''
      })()
    : ''

  const status =
    game.phase === 'over'
      ? game.winner === 0
        ? t.practiceGame.youWin
        : t.opGame.theyWin(opponentName)
      : busy && mover === 1
        ? t.opGame.botThinking
        : null

  const pieceView = (p: Piece) => (
    <PieceView key={p.uid} game={game} piece={p} leader={isLeader(game, p)} selected={selected === p.uid} targetable={targetsNow.has(p.uid)} onClick={() => clickPiece(p)} />
  )

  return (
    <div className="rb-board op-board">
      <div className="rb-topbar">
        <strong>{game.phase === 'over' ? t.opGame.gameOver : game.active === 0 ? t.practiceGame.yourTurn(game.turn) : t.opGame.theirTurn(opponentName, game.turn)}</strong>
        <span className="rb-score" aria-label={t.opGame.lifeLabel(me.life.length, them.life.length)}>
          {goldfish ? t.opGame.lifeOne(me.life.length) : t.opGame.lifeBoth(me.life.length, them.life.length)}
        </span>
        <span className="rb-topbar-actions">
          <button className="btn" disabled={!canUndo} onClick={onUndo}>
            {t.practiceGame.undo}
          </button>
          <button className="btn" aria-pressed={showLog} onClick={() => setShowLog((v) => !v)}>
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

      {status && (
        <div className="rb-prompt rb-status" role="status">
          {status}
        </div>
      )}
      {game.phase === 'mulligan' && !game.kept.includes(0) && (
        <div className="rb-prompt" role="group" aria-label={t.practiceGame.mulliganTitle}>
          <span>{t.opGame.mulliganHelp}</span>
          <button className="btn btn-primary" onClick={() => act(mulligan(game, 0, false))}>
            {t.practiceGame.keep}
          </button>
          <button className="btn" onClick={() => act(mulligan(game, 0, true))}>
            {t.opGame.newHand}
          </button>
        </div>
      )}
      {yourChoice?.kind === 'target' && (
        <div className="rb-prompt" role="status">
          <span>{t.opGame.pick(yourChoice.source, describeEffect(yourChoice.effect))}</span>
          <button className="btn" onClick={() => act(choose(game, 0, null))}>
            {t.practiceGame.skip}
          </button>
        </div>
      )}
      {yourChoice?.kind === 'trigger' && (
        <div className="rb-prompt op-trigger" role="group" aria-label={t.opGame.trigger}>
          {yourChoice.card.imageUrlSmall && <img src={yourChoice.card.imageUrlSmall} alt="" />}
          <span>{t.opGame.triggerText(yourChoice.card.name)}</span>
          <button className="btn btn-primary" onClick={() => act(resolveTrigger(game, 0, true))}>
            {t.opGame.useTrigger}
          </button>
          <button className="btn" onClick={() => act(resolveTrigger(game, 0, false))}>
            {t.opGame.toHand}
          </button>
        </div>
      )}
      {battle && (
        <div className="rb-prompt rb-showdown" role="status">
          <span>{battleText}</span>
          {defending?.step === 'block' && (
            <>
              <span className="text-dim">{t.opGame.blockHelp}</span>
              <button className="btn" onClick={() => act(block(game, 0, null))}>
                {t.opGame.noBlock}
              </button>
            </>
          )}
          {defending?.step === 'counter' && (
            <>
              <span className="text-dim">{t.opGame.counterHelp}</span>
              <button className="btn btn-primary" onClick={() => act(resolveBattle(game, 0))}>
                {t.opGame.doneCounters}
              </button>
            </>
          )}
          {!defending && battle.side === 0 && <span className="text-dim">{t.opGame.theyDefend(opponentName)}</span>}
        </div>
      )}
      {aiming && (
        <div className="rb-prompt" role="status">
          <span>{t.opGame.aimHelp}</span>
          <button className="btn" onClick={() => setAiming(false)}>
            {t.common.cancel}
          </button>
        </div>
      )}
      {replacing != null && (
        <div className="rb-prompt" role="status">
          <span>{t.opGame.fullHelp}</span>
          <button className="btn" onClick={() => setReplacing(null)}>
            {t.common.cancel}
          </button>
        </div>
      )}

      <div className={`rb-main ${showLog ? 'with-log' : ''}`}>
        <div className="rb-field">
          {!goldfish && (
            <>
              <SideBar game={game} side={1} name={opponentName} pieceView={pieceView} />
              <section className="op-characters theirs" aria-label={t.opGame.theirCharacters(opponentName)}>
                {them.characters.length ? them.characters.map(pieceView) : <span className="text-dim">{t.practiceGame.empty}</span>}
              </section>
            </>
          )}
          <section className="op-characters mine" aria-label={t.opGame.yourCharacters}>
            {me.characters.length ? me.characters.map(pieceView) : <span className="text-dim">{t.practiceGame.empty}</span>}
          </section>
          <SideBar game={game} side={0} name={t.practiceGame.you} pieceView={pieceView} onTool={tool} onTrash={() => setTrashOpen((v) => !v)} />

          {piece && (
            <div className="op-tools" role="group" aria-label={t.practiceGame.toolsFor(shortName(piece.card))}>
              <strong>{t.practiceGame.toolsFor(shortName(piece.card))}</strong>
              {piece.owner === 0 && canAttackWith(game, 0, piece.uid) && yourTurn && (
                <button className="btn btn-primary" onClick={() => setAiming(true)}>
                  {t.opGame.attack}
                </button>
              )}
              {piece.owner === 0 && yourTurn && me.donActive > 0 && me.stage?.uid !== piece.uid && (
                <button className="btn" onClick={() => act(giveDon(game, 0, piece.uid))}>
                  {t.opGame.giveDon}
                </button>
              )}
              <button className="btn" onClick={() => tool({ kind: 'power', uid: piece.uid, n: 1000, lasting: false })}>
                +1000
              </button>
              <button className="btn" onClick={() => tool({ kind: 'power', uid: piece.uid, n: -1000, lasting: false })}>
                −1000
              </button>
              <button className="btn" onClick={() => tool({ kind: piece.rested ? 'activate' : 'rest', uid: piece.uid })}>
                {piece.rested ? t.opGame.setActive : t.opGame.rest}
              </button>
              {!isLeader(game, piece) && (
                <>
                  <button className="btn" onClick={() => tool({ kind: 'ko', uid: piece.uid })}>
                    {t.opGame.ko}
                  </button>
                  <button className="btn" onClick={() => tool({ kind: 'toHand', uid: piece.uid })}>
                    {t.practiceGame.toHand}
                  </button>
                  <button className="btn" onClick={() => tool({ kind: 'toBottom', uid: piece.uid })}>
                    {t.practiceGame.toBottom}
                  </button>
                </>
              )}
              {piece.card.text && <p className="op-card-text">{piece.card.text}</p>}
            </div>
          )}

          {trashOpen && (
            <div className="op-tools" role="group" aria-label={t.practiceGame.trashTitle(me.trash.length)}>
              <strong>{t.practiceGame.trashTitle(me.trash.length)}</strong>
              {me.trash.map((card, i) => (
                <button key={`${card.id}-${i}`} className="btn" title={card.text ?? undefined} onClick={() => tool({ kind: 'fromTrash', side: 0, index: i })}>
                  {t.opGame.fromTrash(shortName(card))}
                </button>
              ))}
              <button className="btn" onClick={() => setTrashOpen(false)}>
                {t.common.close}
              </button>
            </div>
          )}

          <div className="rb-hand" aria-label={t.practiceGame.hand}>
            {me.hand.map((card, i) => {
              const playable = yourTurn && canPlay(game, 0, card)
              const counters = defending?.step === 'counter' && canCounter(game, 0, card)
              return (
                <div key={`${card.id}-${i}`} className="rb-hand-slot">
                  <button
                    className={`rb-hand-card ${(yourTurn && !playable) || (defending && !counters) ? 'unaffordable' : ''} ${handPick === i ? 'picked' : ''}`}
                    aria-pressed={handPick === i}
                    title={card.text ?? undefined}
                    onClick={() => setHandPick(handPick === i ? null : i)}
                  >
                    {card.imageUrlSmall ? <img src={card.imageUrlSmall} alt={card.name} loading="lazy" /> : <span className="rb-card-name">{card.name}</span>}
                  </button>
                  {handPick === i && game.phase !== 'mulligan' && (
                    <div className="rb-hand-menu">
                      {playable && (
                        <button className="btn btn-primary" onClick={() => playCard(i)}>
                          {t.opGame.play(costOf(card))}
                        </button>
                      )}
                      {counters && (
                        <button className="btn btn-primary" onClick={() => act(counter(game, 0, i))}>
                          {t.opGame.counter(counterValue(card))}
                        </button>
                      )}
                      {(isCharacter(card) || isStage(card)) && (
                        <button className="btn" title={t.practiceGame.freeTitle} onClick={() => tool({ kind: 'playFree', side: 0, index: i })}>
                          {t.practiceGame.free}
                        </button>
                      )}
                      <button className="btn" onClick={() => tool({ kind: 'trashFromHand', side: 0, index: i })}>
                        {t.practiceGame.toTrash}
                      </button>
                      <button className="btn" onClick={() => tool({ kind: 'handToBottom', side: 0, index: i })}>
                        {t.practiceGame.toBottom}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
        {showLog && <GameLog game={game} onDetail={() => {}} />}
      </div>
    </div>
  )
}

function PieceView({ game, piece, leader, selected, targetable, onClick }: { game: GameState; piece: Piece; leader: boolean; selected: boolean; targetable: boolean; onClick: () => void }) {
  const power = powerNow(game, piece)
  const kw = piece.keywords
  const tags = [kw.rush && 'Rush', kw.blocker && 'Blocker', kw.doubleAttack && 'Double Attack', kw.banish && 'Banish'].filter(Boolean).join(' · ')
  const name = shortName(piece.card)
  return (
    <button
      className={`op-piece ${piece.rested ? 'rested' : ''} ${selected ? 'selected' : ''} ${targetable ? 'targetable' : ''} ${leader ? 'leader' : ''} ${piece.owner === 0 ? 'mine' : 'theirs'}`}
      aria-pressed={selected}
      aria-label={t.opGame.pieceLabel(name, power, piece.don, piece.rested, tags)}
      title={piece.card.text ?? undefined}
      onClick={onClick}
    >
      <span className="op-piece-art">
        {piece.card.imageUrlSmall ? <img src={piece.card.imageUrlSmall} alt="" loading="lazy" /> : <span className="rb-unit-noart">{name}</span>}
        <span className="op-piece-power" aria-hidden>
          {power}
        </span>
        {piece.don > 0 && (
          <span className="op-piece-don" aria-hidden>
            +{piece.don}
          </span>
        )}
      </span>
      <span className="op-piece-name" aria-hidden>
        {name}
      </span>
    </button>
  )
}

function SideBar({ game, side, name, pieceView, onTool, onTrash }: { game: GameState; side: Side; name: string; pieceView: (p: Piece) => React.ReactNode; onTool?: (tl: Tool) => void; onTrash?: () => void }) {
  const p = game.players[side]
  return (
    <section className={`rb-player op-player ${side === 0 ? 'mine' : 'theirs'}`} aria-label={name}>
      <div className="op-leader-row">
        {p.leader && pieceView(p.leader)}
        {p.stage && pieceView(p.stage)}
      </div>
      <div className="op-player-info">
        <strong>{name}</strong>
        <span>{t.opGame.life(p.life.length)}</span>
        <span title={t.opGame.donTitle}>{t.opGame.don(p.donActive, p.donRested, p.donDeck)}</span>
        <span className="text-dim">{t.practiceGame.counts(p.hand.length, p.deck.length, p.trash.length)}</span>
        {onTool && (
          <span className="rb-player-tools">
            <button className="btn" onClick={() => onTool({ kind: 'draw', side })}>
              {t.practiceGame.drawCard}
            </button>
            <button className="btn" disabled={p.donDeck === 0} onClick={() => onTool({ kind: 'addDon', side, active: true })}>
              {t.opGame.addDon}
            </button>
            <button className="btn" onClick={() => onTool({ kind: 'returnDon', side })}>
              {t.opGame.returnDon}
            </button>
            <button className="btn" disabled={p.life.length === 0} onClick={() => onTool({ kind: 'lifeToHand', side })}>
              {t.opGame.lifeToHand}
            </button>
            <button className="btn" onClick={() => onTool({ kind: 'deckToLife', side })}>
              {t.opGame.deckToLife}
            </button>
            <button className="btn" onClick={() => onTool({ kind: 'trashTop', side })}>
              {t.opGame.trashTop}
            </button>
            <button className="btn" onClick={() => onTool({ kind: 'shuffle', side })}>
              {t.practiceGame.shuffle}
            </button>
            {onTrash && (
              <button className="btn" onClick={onTrash}>
                {t.practiceGame.trashButton(p.trash.length)}
              </button>
            )}
          </span>
        )}
      </div>
    </section>
  )
}
