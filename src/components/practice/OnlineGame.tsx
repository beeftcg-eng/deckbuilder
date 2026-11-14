import { useEffect, useRef, useState } from 'react'
import { useCardsById } from '../../state/useAppStore'
import { newGame, type GameState } from '../../shared/practice/riftbound'
import { setupFromDeck } from '../../shared/practice/riftboundBot'
import {
  cleanCode,
  dealOwn,
  fetchGame,
  hideSeat,
  hostGame,
  isCode,
  joinForClient,
  joinGame,
  kept,
  mergeOwnMove,
  privateOf,
  pushGame,
  savePrivate,
  seen,
  splitForServer,
  type OnlineSeat,
  type SharedDeck,
} from '../../shared/practice/online'
import { connectNudges, type Nudger } from '../../shared/practice/realtime'
import type { Deck } from '../../shared/types'
import { t } from '../../shared/i18n'
import { Modal } from '../Modal'
import { Board } from './RiftboundGame'
import { ServerUpdateNote } from '../ServerUpdateNote'

/** How often the game is checked for the other player's moves: often without Realtime, rarely with it (it nudges). */
const POLL_MS = 1500
const POLL_WITH_NUDGES_MS = 6000
const NAME_KEY = 'brewhouse.practice.name'
const CLOCKS = [0, 60, 90, 120, 180]
const REACTIONS = ['👍', '😮', '🤔', '😅', '🔥', 'GG']

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

const shared = (deck: Deck): SharedDeck => ({ name: deck.name, zones: deck.zones, freeTextZones: deck.freeTextZones })

/**
 * A Riftbound game against a friend online (shared/practice/online.ts): start one and share its code,
 * or join with theirs. Both sides play by hand. Each player's hand and deck stay on their own
 * screen: the server only gives each player their own. Moves show up at once over Realtime
 * (realtime.ts), or within a couple of seconds without it. A turn clock, quick reactions and a
 * rematch round it off.
 */
export function OnlineGame({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const cardsById = useCardsById('riftbound')
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState('')
  const [clock, setClock] = useState(0)
  const [seat, setSeat] = useState<OnlineSeat | null>(null)
  const [opponent, setOpponent] = useState<string>('')
  const [game, setGame] = useState<GameState | null>(null)
  const [seq, setSeq] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // The latest values for the timers and the Realtime callback.
  const live = useRef({ seat, seq, sending: false, game, guestDeck: null as SharedDeck | null, dealtFor: -1, lastPoll: 0 })
  const nudger = useRef<Nudger | null>(null)
  useEffect(() => {
    live.current = { ...live.current, seat, seq, game }
  })

  function remember(n: string) {
    setName(n)
    try {
      localStorage.setItem(NAME_KEY, n)
    } catch {
      // not remembered
    }
  }

  /** The host's new game (the first, or a rematch): their own cards private, the guest's dealt by the guest. */
  async function startMatch(s: OnlineSeat, guestDeck: SharedDeck, matchNo: number, since: number) {
    const mine = setupFromDeck(deck, cardsById)
    const theirs = setupFromDeck(guestDeck, cardsById)
    // The guest's cards stay face down here: they deal their own.
    const first: GameState = { ...hideSeat(newGame(mine, theirs, { manual: 'both' }), 1), matchNo, clockSeconds: clock, turnStartedAt: new Date().toISOString() }
    live.current.sending = true
    try {
      const n = await pushGame(s, since, splitForServer(first, 0))
      if (n != null) {
        setSeq(n)
        setGame(first)
        nudger.current?.nudge({ seq: n })
      }
    } finally {
      live.current.sending = false
    }
  }

  /** Brings the game up to date from the server (and deals the guest's own cards on a new match). */
  async function refresh() {
    const s = live.current.seat
    if (!s || live.current.sending) return
    live.current.lastPoll = Date.now()
    const since = live.current.seq
    const snap = await fetchGame(s, since)
    setStatus(null)
    setOpponent(s.seat === 0 ? (snap.guestName ?? '') : snap.hostName)
    if (snap.guestDeck) live.current.guestDeck = snap.guestDeck
    // The host starts the game once the guest has joined with their deck.
    if (s.seat === 0 && snap.seq === 0 && snap.guestDeck && !live.current.game) return startMatch(s, snap.guestDeck, 1, 0)
    if (!snap.state || (snap.seq <= since && !snap.gifts.length)) return
    let state = joinForClient(snap.state, snap.private, snap.gifts, s.seat, cardsById)
    if (!state) {
      setError(t.practiceGame.missingCards)
      return
    }
    // The guest deals their own hand at the start of each match: the host never sees it.
    if (s.seat === 1 && (state.matchNo ?? 1) !== live.current.dealtFor) {
      state = dealOwn(state, 1, setupFromDeck(deck, cardsById).main)
      live.current.dealtFor = state.matchNo ?? 1
      await savePrivate(s, privateOf(state, 1))
    } else if (snap.gifts.length) {
      await savePrivate(s, privateOf(state, s.seat))
    }
    setSeq(snap.seq)
    setGame(seen(state, s.seat))
  }

  // The other player's moves: Realtime nudges, and a check every few seconds besides.
  useEffect(() => {
    if (!seat) return
    let stopped = false
    const tick = () =>
      void refresh().catch((err) => {
        if (!stopped) setStatus(t.practiceGame.offline(err instanceof Error ? err.message : String(err)))
      })
    nudger.current = connectNudges(seat.code, tick)
    tick()
    const timer = setInterval(() => {
      const every = nudger.current?.connected() ? POLL_WITH_NUDGES_MS : POLL_MS
      if (Date.now() - live.current.lastPoll >= every - 50) tick()
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
      nudger.current?.close()
      nudger.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat])

  // The turn clock ticks while there is one.
  const clockOn = !!game?.clockSeconds
  useEffect(() => {
    if (!clockOn) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [clockOn])

  /** Your move: shown at once, then sent. If the other player moved first, a move of your own side's goes on top. */
  async function move(proposed: GameState) {
    if (!seat || !game || proposed === game) return
    // A new turn starts its clock.
    const next = proposed.active !== game.active ? { ...proposed, turnStartedAt: new Date().toISOString() } : proposed
    setGame(next)
    live.current.sending = true
    setStatus(t.practiceGame.sending)
    try {
      let n = await pushGame(seat, seq, splitForServer(kept(next, seat.seat), seat.seat))
      if (n == null) {
        const snap = await fetchGame(seat, 0)
        const state = snap.state ? joinForClient(snap.state, snap.private, snap.gifts, seat.seat, cardsById) : null
        const theirs = state ? seen(state, seat.seat) : null
        const merged = theirs ? mergeOwnMove(game, next, theirs) : null
        if (merged) n = await pushGame(seat, snap.seq, splitForServer(kept(merged, seat.seat), seat.seat))
        if (merged && n != null) {
          setSeq(n)
          setGame(merged)
          setStatus(null)
        } else {
          if (theirs) {
            setSeq(snap.seq)
            setGame(theirs)
          }
          setStatus(t.practiceGame.crossed)
        }
      } else {
        setSeq(n)
        setStatus(null)
      }
      if (n != null) nudger.current?.nudge({ seq: n })
    } catch (err) {
      setStatus(t.practiceGame.offline(err instanceof Error ? err.message : String(err)))
    } finally {
      live.current.sending = false
    }
  }

  /** A quick reaction, into the game log both players see. */
  function react(emoji: string) {
    if (!game) return
    void move({ ...game, log: [...game.log, { turn: game.turn, side: 0, kind: 'info', text: `${name.trim() || t.practiceGame.you}: ${emoji}` }] })
  }

  async function start(join: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (join) {
        const res = await joinGame(cleanCode(code), name.trim() || 'Player', shared(deck))
        setOpponent(res.hostName)
        setSeat(res.seat)
      } else {
        setSeat(await hostGame(name.trim() || 'Player', shared(deck)))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (seat && game) {
    const left = game.clockSeconds && game.turnStartedAt && game.phase === 'main' ? game.clockSeconds - Math.floor((now - Date.parse(game.turnStartedAt)) / 1000) : null
    const canRematch = game.phase === 'over' && seat.seat === 0
    return (
      <Modal label={t.practiceGame.title(deck.name)} className="rb-game-modal" onClose={onClose}>
        <div className="rb-online-bar">
          {left != null && (
            <span className={`rb-clock ${left <= 10 ? 'low' : ''}`} role="timer" aria-label={t.practiceGame.clockLabel}>
              ⏱ {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : t.practiceGame.timeUp}
            </span>
          )}
          <span className="rb-reactions" role="group" aria-label={t.practiceGame.reactions}>
            {REACTIONS.map((r) => (
              <button key={r} className="btn stepper-btn" onClick={() => react(r)} aria-label={t.practiceGame.react(r)}>
                {r}
              </button>
            ))}
          </span>
          {canRematch && (
            <button
              className="btn btn-primary"
              onClick={() => {
                const guestDeck = live.current.guestDeck
                if (guestDeck) void startMatch(seat, guestDeck, (game.matchNo ?? 1) + 1, seq)
              }}
            >
              {t.practiceGame.rematch}
            </button>
          )}
          {game.phase === 'over' && seat.seat === 1 && <span className="text-dim">{t.practiceGame.rematchWait}</span>}
          <span className="text-dim">{t.practiceGame.gameCode(seat.code)}</span>
        </div>
        <Board
          game={game}
          busy={false}
          canUndo={false}
          onUndo={() => {}}
          onChange={(next) => void move(next)}
          onRestart={onClose}
          onClose={onClose}
          opponentName={opponent || t.practiceGame.online}
          status={error ?? status}
        />
      </Modal>
    )
  }

  return (
    <Modal label={t.practiceGame.onlineTitle} className="rb-setup-modal" onClose={onClose}>
      <div className="modal-header">
        <span>{t.practiceGame.onlineTitle}</span>
        <button className="btn" onClick={onClose}>
          {seat ? t.practiceGame.leave : t.common.close}
        </button>
      </div>
      {!seat ? (
        <>
          <p className="text-dim">{t.practiceGame.onlineIntro}</p>
          <ServerUpdateNote version={3} />
          <label className="rb-setup-row">
            <span>{t.practiceGame.yourName}</span>
            <input value={name} maxLength={40} onChange={(e) => remember(e.target.value)} />
          </label>
          <label className="rb-setup-row">
            <span>{t.practiceGame.clock}</span>
            <select value={clock} onChange={(e) => setClock(Number(e.target.value))}>
              {CLOCKS.map((c) => (
                <option key={c} value={c}>
                  {c ? t.practiceGame.clockMinutes(c) : t.practiceGame.noClock}
                </option>
              ))}
            </select>
          </label>
          <div className="rb-setup-row">
            <button className="btn btn-primary" disabled={busy} onClick={() => void start(false)}>
              {t.practiceGame.host}
            </button>
          </div>
          <form
            className="rb-setup-row"
            onSubmit={(e) => {
              e.preventDefault()
              void start(true)
            }}
          >
            <input aria-label={t.practiceGame.joinCode} placeholder={t.practiceGame.joinCode} value={code} maxLength={8} onChange={(e) => setCode(cleanCode(e.target.value))} />
            <button className="btn" type="submit" disabled={busy || !isCode(cleanCode(code))}>
              {t.practiceGame.join}
            </button>
          </form>
        </>
      ) : seat.seat === 0 ? (
        <>
          <p className="rb-code" aria-live="polite">
            {t.practiceGame.waitingFor(seat.code)}
          </p>
          <div className="rb-setup-row">
            <button className="btn" onClick={() => void window.api.clipboard.writeText(seat.code)}>
              {t.practiceGame.copyCode}
            </button>
          </div>
        </>
      ) : (
        <p aria-live="polite">{t.practiceGame.waitingStart}</p>
      )}
      {busy && <p className="text-dim">{t.practiceGame.connecting}</p>}
      {(error ?? status) && <p className="sync-error">{error ?? status}</p>}
    </Modal>
  )
}
