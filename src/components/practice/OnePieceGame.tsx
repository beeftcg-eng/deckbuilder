import { useEffect, useRef, useState } from 'react'
import { useAppStore, useCardsById } from '../../state/useAppStore'
import type { GameState } from '../../shared/practice/onepiece'
import { BOT, botAct, botShouldAct } from '../../shared/practice/onepieceBot'
import type { Deck } from '../../shared/types'
import { t } from '../../shared/i18n'
import { Modal } from '../Modal'
import { Board } from './onepiece/Board'
import { Setup } from './onepiece/Setup'
import { writeSave, type GameMeta } from './onepiece/saves'

const BOT_STEP_MS = 650
const HISTORY = 60
const TIMELINE = 800

/**
 * A One Piece practice game (shared/practice/onepiece.ts) against nobody, or against the bot playing
 * a recent Community list or one of your decks (onepieceBot.ts). Saved on the device to resume; a
 * finished one can be replayed step by step, and its result counts toward your record with the deck.
 */
export function OnePieceGame({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const cardsById = useCardsById('onepiece')
  const addPracticeResult = useAppStore((s) => s.addPracticeResult)
  const [game, setGame] = useState<GameState | null>(null)
  const [meta, setMeta] = useState<GameMeta | null>(null)
  const [history, setHistory] = useState<GameState[]>([])
  const [botRunning, setBotRunning] = useState(false)
  const [timeline, setTimeline] = useState<GameState[]>([])
  const [replayAt, setReplayAt] = useState<number | null>(null)

  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  function show(next: GameState, m: GameMeta, previous: GameState | null) {
    setGame(next)
    setTimeline((tl) => [...tl, next].slice(-TIMELINE))
    writeSave(deck.id, m, next)
    if (next.phase === 'over' && previous?.phase !== 'over' && !next.players[BOT].empty && next.winner != null) {
      addPracticeResult({
        at: new Date().toISOString(),
        deckId: deck.id,
        opponentId: m.opponentId,
        opponentName: m.opponentName,
        won: next.winner === 0,
        // Life left, yours and theirs.
        points: [next.players[0].life.length, next.players[1].life.length],
        level: m.level,
        byHand: m.byHand,
      })
    }
    const bots = botShouldAct(next, BOT)
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

  if (!game || !meta) return <Setup deck={deck} cardsById={cardsById} onStart={begin} onClose={onClose} />

  const replaying = replayAt != null
  return (
    <Modal label={t.practiceGame.title(deck.name)} className="rb-game-modal" onClose={onClose}>
      {replaying && (
        <div className="rb-prompt rb-replay" role="group" aria-label={t.practiceGame.replay}>
          <button className="btn" disabled={replayAt === 0} onClick={() => setReplayAt((i) => Math.max(0, (i ?? 0) - 1))} aria-label={t.practiceGame.replayBack}>
            ◀
          </button>
          <input type="range" min={0} max={timeline.length - 1} value={replayAt} aria-label={t.practiceGame.replayStep(replayAt + 1, timeline.length)} onChange={(e) => setReplayAt(Number(e.target.value))} />
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
        opponentName={meta.opponentName}
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
