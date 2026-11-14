import type { Deck } from '../types'
import { DEFAULT_PAWMODORO_ANON_KEY, DEFAULT_PAWMODORO_URL } from '../pawmodoroDefaults'
import { beginIfKept, other, type GameState, type Side } from './riftbound'

/**
 * Practice games online with a friend (scripts/pawmodoro-migration-2026-11-14-practice-online.sql).
 * One player starts a game and gets a code, the other joins with it and their own deck. Both play by
 * hand, like at a table. The game is kept from the host's side; the guest's app flips it, so each
 * player sees themselves at the bottom as "you". Moves go up with the number of the state they were
 * made on, so two at once can't overwrite each other.
 */

/** The deck as it travels: its cards by id (the other player has the card data). */
export type SharedDeck = Pick<Deck, 'name' | 'zones' | 'freeTextZones'>

export interface OnlineSeat {
  code: string
  secret: string
  /** 0: the host, 1: the guest. */
  seat: Side
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function random(n: number, alphabet: string): string {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

export const newCode = () => random(6, CODE_LETTERS)
const newSecret = () => random(32, 'abcdefghijklmnopqrstuvwxyz0123456789')

/** A code as typed: upper case, without spaces or the letters it never uses. */
export const cleanCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '')
export const isCode = (code: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(code)

async function rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${DEFAULT_PAWMODORO_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: DEFAULT_PAWMODORO_ANON_KEY, Authorization: `Bearer ${DEFAULT_PAWMODORO_ANON_KEY}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    let message = text
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text
    } catch {
      // not JSON
    }
    throw new Error(res.status === 404 ? 'online games need a server update' : message || String(res.status))
  }
  return (text ? JSON.parse(text) : null) as T
}

export async function hostGame(name: string, deck: SharedDeck): Promise<OnlineSeat> {
  const code = newCode()
  const secret = newSecret()
  await rpc('deckbuilder_practice_create', { p_code: code, p_secret: secret, p_name: name, p_deck: deck })
  return { code, secret, seat: 0 }
}

export async function joinGame(code: string, name: string, deck: SharedDeck): Promise<{ seat: OnlineSeat; hostName: string; hostDeck: SharedDeck }> {
  const secret = newSecret()
  const res = await rpc<{ host_name: string; host_deck: SharedDeck }>('deckbuilder_practice_join', { p_code: code, p_secret: secret, p_name: name, p_deck: deck })
  return { seat: { code, secret, seat: 1 }, hostName: res.host_name, hostDeck: res.host_deck }
}

export interface Snapshot {
  seq: number
  /** The packed state (host's side), when it changed after the number asked about. */
  state: string | null
  hostName: string
  guestName: string | null
  guestDeck: SharedDeck | null
}

export async function fetchGame(seat: OnlineSeat, since: number): Promise<Snapshot> {
  const r = await rpc<{ seq: number; state: string | null; host_name: string; guest_name: string | null; guest_deck: SharedDeck | null }>('deckbuilder_practice_get', {
    p_code: seat.code,
    p_secret: seat.secret,
    p_since: since,
  })
  return { seq: r.seq, state: r.state, hostName: r.host_name, guestName: r.guest_name, guestDeck: r.guest_deck }
}

/** Sends a move made on state number `seq`; the new number, or null when the other player moved first. */
export async function pushGame(seat: OnlineSeat, seq: number, packed: string): Promise<number | null> {
  const n = await rpc<number>('deckbuilder_practice_push', { p_code: seat.code, p_secret: seat.secret, p_seq: seq, p_state: packed })
  return n < 0 ? null : n
}

// ---------- seeing the game from the other side ----------

/** Swaps "you" and "the opponent" in a log line, both ways (flipping twice gives it back). */
function flipText(text: string): string {
  const pairs: [string, string][] = [
    ['Your opponent wins.', 'You win!'],
    ["Opponent's turn", 'Your turn'],
    ['your opponent may', 'you may'],
    ['Your opponent goes first.', 'You go first.'],
    ['Opponent ', 'You '],
    ['Their ', 'Your '],
    ['their ', 'your '],
  ]
  let out = text
  pairs.forEach(([a, b], i) => {
    out = out.split(a).join(`\u0000${i}a`).split(b).join(`\u0000${i}b`)
  })
  pairs.forEach(([a, b], i) => {
    out = out.split(`\u0000${i}a`).join(b).split(`\u0000${i}b`).join(a)
  })
  return out
}

/** The game from the other player's side: side 0 and side 1 swap everywhere. */
export function flipState(s: GameState): GameState {
  const f = (x: Side) => other(x)
  const fn = (x: Side | null) => (x == null ? null : f(x))
  const unit = <U extends { owner: Side }>(u: U): U => ({ ...u, owner: f(u.owner) })
  const player = (p: GameState['players'][number]) => ({ ...p, base: p.base.map(unit) })
  return {
    ...s,
    players: [player(s.players[1]), player(s.players[0])],
    battlefields: s.battlefields.map((b) => ({
      ...b,
      controller: fn(b.controller),
      units: b.units.map(unit),
      scored: b.scored.map(f),
      hidden: (b.hidden ?? []).map(unit),
    })),
    showdown: s.showdown ? { ...s.showdown, attacker: f(s.showdown.attacker), focus: f(s.showdown.focus) } : null,
    active: f(s.active),
    first: f(s.first),
    kept: s.kept.map(f),
    manual: s.manual.map(f),
    winner: fn(s.winner),
    log: s.log.map((e) => ({ ...e, side: f(e.side), text: flipText(e.text) })),
  }
}

/**
 * Two moves made at once (both players keeping their hands, say): when yours changed only your own
 * side (side 0 from where you sit: hand, deck, runes, points...) and the log, it goes on top of
 * theirs as is. Null when yours touched anything shared; then it has to be made again.
 */
export function mergeOwnMove(before: GameState, mine: GameState, theirs: GameState): GameState | null {
  const shared = (s: GameState) => JSON.stringify({ ...s, players: [null, s.players[1]], kept: null, log: null, nextUid: null })
  if (shared(before) !== shared(mine)) return null
  const merged: GameState = {
    ...theirs,
    players: [mine.players[0], theirs.players[1]],
    kept: [...new Set([...theirs.kept, ...mine.kept])],
    log: [...theirs.log, ...mine.log.slice(before.log.length)],
    nextUid: Math.max(theirs.nextUid, mine.nextUid) + 1,
  }
  return beginIfKept(merged)
}

/** The state as this player sees it (the guest sees it flipped). */
export const seen = (s: GameState, seat: Side) => (seat === 0 ? s : flipState(s))
/** The state as kept on the server (the host's side). */
export const kept = (s: GameState, seat: Side) => (seat === 0 ? s : flipState(s))
