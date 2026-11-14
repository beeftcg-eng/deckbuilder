import { useEffect, useRef, useState } from 'react'
import { useCardsById } from '../../state/useAppStore'
import { newGame, type GameState } from '../../shared/practice/riftbound'
import { setupFromDeck } from '../../shared/practice/riftboundBot'
import { packState, unpackState } from '../../shared/practice/serialize'
import { cleanCode, fetchGame, hostGame, isCode, joinGame, kept, mergeOwnMove, pushGame, seen, type OnlineSeat, type SharedDeck } from '../../shared/practice/online'
import type { Deck } from '../../shared/types'
import { t } from '../../shared/i18n'
import { Modal } from '../Modal'
import { Board } from './RiftboundGame'

/** How often the game is checked for the other player's moves. */
const POLL_MS = 1500
const NAME_KEY = 'brewhouse.practice.name'

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
 * or join with theirs. Both sides play by hand. Each move is sent as it's made; the other player's
 * moves show up within a couple of seconds.
 */
export function OnlineGame({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const cardsById = useCardsById('riftbound')
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState('')
  const [seat, setSeat] = useState<OnlineSeat | null>(null)
  const [opponent, setOpponent] = useState<string>('')
  const [game, setGame] = useState<GameState | null>(null)
  const [seq, setSeq] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The latest values for the polling timer.
  const live = useRef({ seat, seq, sending: false, game })
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

  /** The other player's moves (and, for the host, the guest arriving). */
  useEffect(() => {
    if (!seat) return
    let stopped = false
    const tick = async () => {
      const { seq: since, sending } = live.current
      if (sending) return
      try {
        const snap = await fetchGame(seat, since)
        if (stopped) return
        setStatus(null)
        setOpponent(seat.seat === 0 ? (snap.guestName ?? '') : snap.hostName)
        // The host starts the game once the guest has joined with their deck.
        if (seat.seat === 0 && snap.seq === 0 && snap.guestDeck && !live.current.game) {
          const mine = setupFromDeck(deck, cardsById)
          const theirs = setupFromDeck(snap.guestDeck, cardsById)
          const first = newGame(mine, theirs, { manual: 'both' })
          live.current.sending = true
          const n = await pushGame(seat, 0, packState(first))
          live.current.sending = false
          if (n != null) {
            setSeq(n)
            setGame(first)
          }
          return
        }
        if (snap.state && snap.seq > since) {
          const state = unpackState(snap.state, cardsById)
          if (!state) {
            setError(t.practiceGame.missingCards)
            return
          }
          setSeq(snap.seq)
          setGame(seen(state, seat.seat))
        }
      } catch (err) {
        if (!stopped) setStatus(t.practiceGame.offline(err instanceof Error ? err.message : String(err)))
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [seat, deck, cardsById])

  /** Your move: shown at once, then sent. If the other player moved first, the game reloads. */
  async function move(next: GameState) {
    if (!seat || !game || next === game) return
    setGame(next)
    live.current.sending = true
    setStatus(t.practiceGame.sending)
    try {
      let n = await pushGame(seat, seq, packState(kept(next, seat.seat)))
      if (n == null) {
        // The other player moved first. A move of your own side's goes on top of theirs; anything else is made again.
        const snap = await fetchGame(seat, 0)
        const state = snap.state ? unpackState(snap.state, cardsById) : null
        const theirs = state ? seen(state, seat.seat) : null
        const merged = theirs ? mergeOwnMove(game, next, theirs) : null
        if (merged) n = await pushGame(seat, snap.seq, packState(kept(merged, seat.seat)))
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
    } catch (err) {
      setStatus(t.practiceGame.offline(err instanceof Error ? err.message : String(err)))
    } finally {
      live.current.sending = false
    }
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
    return (
      <Modal label={t.practiceGame.title(deck.name)} className="rb-game-modal" onClose={onClose}>
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
          <label className="rb-setup-row">
            <span>{t.practiceGame.yourName}</span>
            <input value={name} maxLength={40} onChange={(e) => remember(e.target.value)} />
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
