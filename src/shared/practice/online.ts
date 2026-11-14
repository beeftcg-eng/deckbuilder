import type { Card, Deck } from '../types'
import { packState, unpackState } from './serialize'
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
  /** The packed board (host's side, every hand face down), when it changed after the number asked about. */
  state: string | null
  /** Your own hand, deck and face-down cards. */
  private: string | null
  /** Cards the other player put in your hand since you last asked. */
  gifts: string[]
  hostName: string
  guestName: string | null
  guestDeck: SharedDeck | null
}

export async function fetchGame(seat: OnlineSeat, since: number): Promise<Snapshot> {
  const r = await rpc<{ seq: number; state: string | null; private: string | null; gifts: string[]; host_name: string; guest_name: string | null; guest_deck: SharedDeck | null }>('deckbuilder_practice_get2', {
    p_code: seat.code,
    p_secret: seat.secret,
    p_since: since,
  })
  return { seq: r.seq, state: r.state, private: r.private, gifts: r.gifts ?? [], hostName: r.host_name, guestName: r.guest_name, guestDeck: r.guest_deck }
}

/** Sends a move made on state number `seq`; the new number, or null when the other player moved first. */
export async function pushGame(seat: OnlineSeat, seq: number, part: ServerPart): Promise<number | null> {
  const n = await rpc<number>('deckbuilder_practice_push2', { p_code: seat.code, p_secret: seat.secret, p_seq: seq, p_state: part.board, p_private: part.private, p_gifts: part.gifts })
  return n < 0 ? null : n
}

/** Saves your private cards without a move (after dealing your own hand, or taking gifts). */
export async function savePrivate(seat: OnlineSeat, privatePart: string): Promise<void> {
  await rpc('deckbuilder_practice_set_private', { p_code: seat.code, p_secret: seat.secret, p_private: privatePart })
}

// ---------- private hands ----------

/** A card face down: what the other player's hand, deck and hidden cards look like on your board. */
export const FACE_DOWN: Card = {
  id: 'riftbound:token-facedown',
  gameId: 'riftbound',
  sourceId: 'facedown',
  name: 'Face-down card',
  imageUrl: null,
  imageUrlSmall: null,
  orientation: 'portrait',
  setId: 'token',
  setName: 'Token',
  setCode: 'TOKEN',
  number: '0',
  rarity: null,
  category: 'Unit',
  subtypes: ['Token'],
  colors: [],
  cost: null,
  text: null,
  legality: null,
}
const isFaceDown = (c: Card) => c.id === FACE_DOWN.id

/** One player's cards nobody else sees: hand, deck (in order) and face-down cards, by id. */
interface PrivatePart {
  hand: string[]
  deck: string[]
  hidden: Record<string, string>
}

/** What goes to the server for a move: the board with every hand face down, your own cards, and cards given to the other player. */
export interface ServerPart {
  board: string
  private: string
  gifts: string[]
}

/**
 * Splits the game (the host's side, as kept) for the server: hands, decks and face-down cards become
 * face-down placeholders on the board; `seat`'s own go in its private part; real cards that turned
 * up in the other player's hand (returned to it by this move) are gifts for them.
 */
export function splitForServer(state: GameState, seat: Side): ServerPart {
  const foe = other(seat)
  const gifts = state.players[foe].hand.filter((c) => !isFaceDown(c)).map((c) => c.id)
  const mine: PrivatePart = {
    hand: state.players[seat].hand.map((c) => c.id),
    deck: state.players[seat].deck.map((c) => c.id),
    hidden: Object.fromEntries(state.battlefields.flatMap((b) => (b.hidden ?? []).filter((h) => h.owner === seat && !isFaceDown(h.card)).map((h) => [h.uid, h.card.id]))),
  }
  const board: GameState = {
    ...state,
    players: state.players.map((p) => ({ ...p, hand: p.hand.map(() => FACE_DOWN), deck: p.deck.map(() => FACE_DOWN) })) as GameState['players'],
    battlefields: state.battlefields.map((b) => ({ ...b, hidden: (b.hidden ?? []).map((h) => ({ ...h, card: FACE_DOWN })) })),
  }
  return { board: packState(board), private: JSON.stringify(mine), gifts }
}

/**
 * The game for `seat` to play: the shared board with its own cards put back (and any gifts added to
 * its hand). Null when a card isn't in the card data. `privatePart` null: not dealt yet.
 */
export function joinForClient(board: string, privatePart: string | null, gifts: string[], seat: Side, cardsById: Map<string, Card>): GameState | null {
  const state = unpackState(board, new Map([...cardsById, [FACE_DOWN.id, FACE_DOWN]]))
  if (!state) return null
  if (privatePart) {
    let mine: PrivatePart
    try {
      mine = JSON.parse(privatePart) as PrivatePart
    } catch {
      return null
    }
    const card = (id: string) => cardsById.get(id)
    const hand = mine.hand.map(card)
    const deck = mine.deck.map(card)
    if (hand.some((c) => !c) || deck.some((c) => !c)) return null
    state.players[seat].hand = hand as Card[]
    state.players[seat].deck = deck as Card[]
    for (const bf of state.battlefields) {
      bf.hidden = bf.hidden.map((h) => (h.owner === seat && mine.hidden[h.uid] && card(mine.hidden[h.uid]) ? { ...h, card: card(mine.hidden[h.uid])! } : h))
    }
  }
  for (const id of gifts) {
    const c = cardsById.get(id)
    if (c) state.players[seat].hand.push(c)
  }
  return state
}

/**
 * `seat`'s hand and deck turned face down: what the host's app keeps of the guest's side when it
 * starts a match, since the guest deals their own (and real cards there would count as gifts).
 */
export function hideSeat(state: GameState, seat: Side): GameState {
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], hand: players[seat].hand.map(() => FACE_DOWN), deck: players[seat].deck.map(() => FACE_DOWN) }
  return { ...state, players }
}

/** Deals `seat` its own hand from its own freshly shuffled deck (the guest, on joining: the host never saw it). */
export function dealOwn(state: GameState, seat: Side, main: Card[]): GameState {
  const deck = [...main]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const players = [...state.players] as GameState['players']
  players[seat] = { ...players[seat], hand: deck.slice(0, 4), deck: deck.slice(4) }
  return { ...state, players }
}

/** A player's private part from a full state (to save it without a move). */
export const privateOf = (state: GameState, seat: Side) => splitForServer(state, seat).private

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
