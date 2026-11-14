import { useEffect, useRef, useState } from 'react'
import { useAppStore, useCardsById } from '../../state/useAppStore'
import { OnlineGame } from './OnlineGame'
import type { GameState } from '../../shared/practice/riftbound'
import { BOT, botAct, botShouldAct } from '../../shared/practice/riftboundBot'
import type { Deck } from '../../shared/types'
import { t } from '../../shared/i18n'
import { Modal } from '../Modal'
import { Board } from './riftbound/Board'
import { Setup } from './riftbound/Setup'
import { writeSave, type GameMeta, TIMELINE } from './riftbound/saves'

/** How long each of the bot's moves stays on screen before the next. */
const AUTO_PASS_KEY = 'brewhouse.practice.riftbound.autoPass'
const BOT_STEP_MS = 650
const HISTORY = 60

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

  // "Pass for me when I can't answer": a per-device convenience.
  const [autoPass, setAutoPass] = useState(() => {
    try {
      return localStorage.getItem(AUTO_PASS_KEY) !== 'off'
    } catch {
      return true
    }
  })
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
        autoPass={autoPass}
        onAutoPass={(on) => {
          setAutoPass(on)
          try {
            localStorage.setItem(AUTO_PASS_KEY, on ? 'on' : 'off')
          } catch {
            // Not kept: it's on again next time.
          }
        }}
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
