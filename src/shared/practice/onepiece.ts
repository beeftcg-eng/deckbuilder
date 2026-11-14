import type { Card } from '../types'
import { describeEffect, sectionFor, type Effect, type Timing } from './onepieceEffects'

/**
 * A One Piece Card Game practice game, from the Comprehensive Rules: Leader and Life, the DON!!
 * deck (1 DON!! on the first player's first turn, 2 every turn after, up to 10), Characters (5 at
 * most), Stages, Events, battles with the Block and Counter steps, Triggers, and winning by hitting
 * a Leader with no Life left (or the other player running out of cards).
 *
 * Keywords it runs: Rush, Blocker, Double Attack, Banish. Card text it can read (onepieceEffects.ts)
 * runs by itself unless you're playing by hand; anything else goes in the log with its text, for
 * you to do with the tools (K.O., return, ±power, draw...).
 *
 * Like the Riftbound game (riftbound.ts), every action takes a state and returns a new one, so the
 * board keeps a history for Undo and the bot can try moves out.
 *
 * Left out, on purpose: [DON!! xN], [Your Turn] and [Activate: Main] abilities, costs cards change,
 * and replacement effects; they're in the card's text for you to apply.
 */

export type Side = 0 | 1
export const other = (side: Side): Side => (side === 0 ? 1 : 0)
export const MAX_CHARACTERS = 5
export const DON_DECK = 10

export interface Keywords {
  rush: boolean
  blocker: boolean
  doubleAttack: boolean
  banish: boolean
}

/** A Leader, Character or Stage on the field. */
export interface Piece {
  uid: string
  card: Card
  owner: Side
  rested: boolean
  /** DON!! cards given to it: +1000 power each during its owner's turn. */
  don: number
  /** Printed power. */
  power: number
  /** +/- power that lasts (the tools). */
  bonus: number
  /** +/- power this turn. */
  temp: number
  /** +/- power this battle (Counters). */
  battle: number
  /** The turn it came into play (Characters can't attack that turn, without Rush). */
  playedTurn: number
  keywords: Keywords
}

export interface Player {
  leader: Piece | null
  /** Face down; the last card is the top one. */
  life: Card[]
  deck: Card[]
  hand: Card[]
  trash: Card[]
  characters: Piece[]
  stage: Piece | null
  donDeck: number
  donActive: number
  donRested: number
  /** Turns this player has started (their first turn can't attack). */
  turns: number
  /** Nobody plays this side (goldfishing). */
  empty: boolean
}

/** An attack in progress: the defender may block, then play counters, then it's resolved. */
export interface Battle {
  attacker: string
  side: Side
  target: string
  step: 'block' | 'counter'
}

/** A choice waiting on a player: a target for an effect, or whether to use a Life card's Trigger. */
export type Choice =
  | { kind: 'target'; side: Side; effect: Effect; legal: string[]; source: string; rest: Effect[]; battle: boolean }
  | { kind: 'trigger'; side: Side; card: Card }

export type LogKind = 'turn' | 'play' | 'attack' | 'battle' | 'effect' | 'tool' | 'info' | 'win'

export interface LogEntry {
  turn: number
  side: Side
  kind: LogKind
  text: string
  card?: Card
}

export interface GameState {
  game: 'onepiece'
  players: [Player, Player]
  /** Round number: both players have had `turn - 1` full turns. */
  turn: number
  /** Turns started in all, for "played this turn". */
  turnNo: number
  active: Side
  first: Side
  phase: 'mulligan' | 'main' | 'over'
  battle: Battle | null
  /** Waiting choices, first one first. */
  choices: Choice[]
  /** Sides whose card text isn't run for them (they do it with the tools). */
  manual: Side[]
  /** Sides that pick their own targets and Triggers (the rest are picked for them: the bot). */
  humans: Side[]
  kept: Side[]
  winner: Side | null
  log: LogEntry[]
  nextUid: number
}

export interface DeckSetup {
  leader: Card | null
  /** One entry per copy. */
  main: Card[]
}

// ---------- reading cards ----------

const stat = (card: Card, name: string): number | null => {
  const m = new RegExp(`^${name}:\\s*([\\d,]+)`, 'im').exec(card.text ?? '')
  return m ? Number(m[1].replace(/,/g, '')) : null
}
export const powerOf = (card: Card) => stat(card, 'Power') ?? 0
export const counterOf = (card: Card) => stat(card, 'Counter') ?? 0
export const lifeOf = (card: Card) => stat(card, 'Life') ?? 5
export const costOf = (card: Card) => {
  const n = Number.parseInt(card.cost ?? '', 10)
  return Number.isFinite(n) ? n : 0
}
export const isCharacter = (card: Card) => card.category === 'Character'
export const isEvent = (card: Card) => card.category === 'Event'
export const isStage = (card: Card) => card.category === 'Stage'

export function keywordsOf(card: Card): Keywords {
  const text = (card.text ?? '').replace(/\([^)]*\)/g, '')
  // Only the card's own keywords, not ones it gives others ("gains [Blocker]").
  const own = (k: string) => new RegExp(`(^|[\\s.])\\[${k}\\](?! *(?:during|until))`, 'i').test(text) && !new RegExp(`gains? \\[${k}\\]`, 'i').test(text)
  return { rush: own('Rush'), blocker: own('Blocker'), doubleAttack: own('Double Attack'), banish: own('Banish') }
}

export const counterText = (card: Card) => (isEvent(card) ? sectionFor(card, 'counter') : undefined)

// ---------- setup ----------

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function emptyPlayer(empty: boolean): Player {
  return { leader: null, life: [], deck: [], hand: [], trash: [], characters: [], stage: null, donDeck: DON_DECK, donActive: 0, donRested: 0, turns: 0, empty }
}

function clone(state: GameState): GameState {
  const piece = (p: Piece): Piece => ({ ...p })
  const player = (p: Player): Player => ({
    ...p,
    leader: p.leader ? piece(p.leader) : null,
    life: [...p.life],
    deck: [...p.deck],
    hand: [...p.hand],
    trash: [...p.trash],
    characters: p.characters.map(piece),
    stage: p.stage ? piece(p.stage) : null,
  })
  return {
    ...state,
    players: [player(state.players[0]), player(state.players[1])],
    battle: state.battle ? { ...state.battle } : null,
    choices: [...state.choices],
    kept: [...state.kept],
    log: [...state.log],
  }
}

export const who = (side: Side) => (side === 0 ? 'You' : 'Opponent')

function log(s: GameState, side: Side, kind: LogKind, text: string, card?: Card) {
  s.log.push({ turn: s.turn, side, kind, text, ...(card ? { card } : {}) })
}

function newPiece(s: GameState, card: Card, owner: Side): Piece {
  s.nextUid += 1
  return { uid: `p${s.nextUid}`, card, owner, rested: false, don: 0, power: powerOf(card), bonus: 0, temp: 0, battle: 0, playedTurn: s.turnNo, keywords: keywordsOf(card) }
}

/** A new game: decks shuffled, five cards each, waiting for mulligans. `opponent` null is playing alone. */
export function newGame(you: DeckSetup, opponent: DeckSetup | null, options: { first?: Side; random?: () => number; manual?: boolean | 'both'; humans?: Side[] } = {}): GameState {
  const random = options.random ?? Math.random
  const players: [Player, Player] = [emptyPlayer(false), emptyPlayer(opponent == null)]
  const s: GameState = {
    game: 'onepiece',
    players,
    turn: 1,
    turnNo: 0,
    active: 0,
    first: 0,
    phase: 'mulligan',
    battle: null,
    choices: [],
    manual: options.manual === 'both' ? [0, 1] : options.manual ? [0] : [],
    humans: options.humans ?? [0],
    kept: opponent ? [] : [1],
    winner: null,
    log: [],
    nextUid: 0,
  }
  ;[you, opponent].forEach((setup, i) => {
    if (!setup) return
    const p = players[i]
    p.deck = shuffled(setup.main, random)
    p.leader = setup.leader ? newPiece(s, setup.leader, i as Side) : null
    p.hand = p.deck.splice(0, 5)
  })
  s.first = opponent ? (options.first ?? (random() < 0.5 ? 0 : 1)) : 0
  s.active = s.first
  log(s, s.first, 'info', s.first === 0 ? 'You go first.' : 'Your opponent goes first.')
  return s
}

/** Keep the hand, or (once) shuffle it back and draw five new. Once both have kept, Life is dealt and the first turn starts. */
export function mulligan(state: GameState, side: Side, redraw: boolean, random: () => number = Math.random): GameState {
  if (state.phase !== 'mulligan' || state.kept.includes(side)) return state
  const s = clone(state)
  const p = s.players[side]
  if (redraw) {
    p.deck = shuffled([...p.deck, ...p.hand], random)
    p.hand = p.deck.splice(0, 5)
  }
  s.kept.push(side)
  log(s, side, 'info', redraw ? `${who(side)} drew a new hand.` : `${who(side)} kept.`)
  return beginIfKept(s, true)
}

/** Deals Life and starts the first turn once both have kept. */
export function beginIfKept(state: GameState, owned = false): GameState {
  if (state.phase !== 'mulligan' || state.kept.length < 2) return state
  const s = owned ? state : clone(state)
  for (const p of s.players) {
    if (p.empty || !p.leader) continue
    p.life = p.deck.splice(0, lifeOf(p.leader.card)).reverse()
  }
  s.phase = 'main'
  startTurn(s)
  return s
}

// ---------- the field ----------

export function pieces(s: GameState, side?: Side): Piece[] {
  const sides = side == null ? [0, 1] : [side]
  return sides.flatMap((i) => {
    const p = s.players[i]
    return [...(p.leader ? [p.leader] : []), ...p.characters]
  })
}

export function findPiece(s: GameState, uid: string): Piece | null {
  for (const p of s.players) {
    if (p.leader?.uid === uid) return p.leader
    const c = p.characters.find((x) => x.uid === uid)
    if (c) return c
    if (p.stage?.uid === uid) return p.stage
  }
  return null
}

export const isLeader = (s: GameState, piece: Piece) => s.players[piece.owner].leader?.uid === piece.uid

/** Its power right now: DON!! count only on its owner's turn. */
export function powerNow(s: GameState, piece: Piece): number {
  return Math.max(0, piece.power + piece.bonus + piece.temp + piece.battle + (s.active === piece.owner ? piece.don * 1000 : 0))
}

export const donOnField = (p: Player) => p.donActive + p.donRested + [p.leader, ...p.characters].reduce((n, x) => n + (x?.don ?? 0), 0)

function checkWin(s: GameState) {
  if (s.phase === 'over') return
  for (const side of [0, 1] as Side[]) {
    const p = s.players[side]
    if (!p.empty && p.deck.length === 0 && s.phase === 'main') {
      win(s, other(side), `${who(side)} ran out of cards.`)
      return
    }
  }
}

function win(s: GameState, side: Side, why: string) {
  s.phase = 'over'
  s.winner = side
  s.battle = null
  s.choices = []
  log(s, side, 'win', `${why} ${side === 0 ? 'You win!' : 'Your opponent wins.'}`)
}

function draw(s: GameState, side: Side, n = 1) {
  const p = s.players[side]
  for (let i = 0; i < n && p.deck.length > 0; i++) p.hand.push(p.deck.shift()!)
  checkWin(s)
}

// ---------- turns ----------

/** Refresh (DON!! back, everything active), Draw (not the first player's first turn), DON!! (+2, +1 on the very first turn). */
function startTurn(s: GameState) {
  s.turnNo += 1
  const side = s.active
  const p = s.players[side]
  log(s, side, 'turn', side === 0 ? `Your turn ${s.turn}.` : `Opponent's turn ${s.turn}.`)
  const attached = [p.leader, ...p.characters].reduce((n, x) => n + (x?.don ?? 0), 0)
  for (const x of [p.leader, ...p.characters, p.stage]) {
    if (!x) continue
    x.don = 0
    x.rested = false
  }
  p.donActive += p.donRested + attached
  p.donRested = 0
  const firstEver = side === s.first && p.turns === 0
  p.turns += 1
  if (!firstEver) draw(s, side)
  const add = Math.min(p.donDeck, firstEver ? 1 : 2)
  p.donDeck -= add
  p.donActive += add
}

export function endTurn(state: GameState): GameState {
  if (state.phase !== 'main' || state.battle || state.choices.length) return state
  const s = clone(state)
  for (const x of pieces(s)) x.temp = 0
  log(s, s.active, 'info', `${who(s.active)} ended the turn.`)
  const next = other(s.active)
  if (!s.players[next].empty) {
    s.active = next
    if (next === s.first) s.turn += 1
  } else s.turn += 1
  startTurn(s)
  return s
}

// ---------- effects ----------

function legalFor(s: GameState, side: Side, e: Effect, battleTarget: string | null): string[] {
  const opp = s.players[other(side)]
  const mine = s.players[side]
  switch (e.kind) {
    case 'ko':
      return opp.characters.filter((c) => (e.maxCost == null || costOf(c.card) <= e.maxCost) && (e.maxPower == null || powerNow(s, c) <= e.maxPower)).map((c) => c.uid)
    case 'rest':
      return opp.characters.filter((c) => !c.rested && (e.maxCost == null || costOf(c.card) <= e.maxCost)).map((c) => c.uid)
    case 'weaken':
      return [...(e.leader && opp.leader ? [opp.leader] : []), ...opp.characters].map((c) => c.uid)
    case 'bounce':
      return opp.characters.filter((c) => e.maxCost == null || costOf(c.card) <= e.maxCost).map((c) => c.uid)
    case 'buff': {
      const yours = [...(e.leader && mine.leader ? [mine.leader] : []), ...(e.onlyLeader ? [] : mine.characters)].map((c) => c.uid)
      // In a battle, the card defending (or attacking) is the one it's for, when it can be.
      if (e.battle && battleTarget) {
        const inBattle = [battleTarget, s.battle?.attacker].filter((u): u is string => !!u && yours.includes(u))
        if (inBattle.length) return [inBattle.find((u) => findPiece(s, u)?.owner === side) ?? inBattle[0]]
      }
      return yours
    }
    default:
      return []
  }
}

/** The bot's pick: the opponent's biggest threat, or its own card in the battle / its Leader. */
function bestPick(s: GameState, e: Effect, legal: string[]): string | null {
  if (legal.length === 0) return null
  const ps = legal.map((u) => findPiece(s, u)!).filter(Boolean)
  if (e.kind === 'buff') return ps.find((p) => s.battle?.target === p.uid)?.uid ?? ps.find((p) => isLeader(s, p))?.uid ?? ps[0].uid
  if (e.kind === 'rest') return [...ps].sort((a, b) => powerNow(s, b) - powerNow(s, a))[0].uid
  return [...ps].sort((a, b) => costOf(b.card) - costOf(a.card) || powerNow(s, b) - powerNow(s, a))[0].uid
}

function applyEffect(s: GameState, side: Side, e: Effect, target: string | null, source: string) {
  const piece = target ? findPiece(s, target) : null
  switch (e.kind) {
    case 'draw':
      draw(s, side, e.n)
      log(s, side, 'effect', `${source}: ${who(side)} drew ${e.n}.`)
      return
    case 'addDon': {
      const p = s.players[side]
      const n = Math.min(e.n, p.donDeck)
      p.donDeck -= n
      if (e.active) p.donActive += n
      else p.donRested += n
      log(s, side, 'effect', `${source}: added ${n} DON!!.`)
      return
    }
    case 'playSelf':
      return
  }
  if (!piece) return
  switch (e.kind) {
    case 'ko':
      ko(s, piece.uid, source)
      return
    case 'rest':
      piece.rested = true
      log(s, side, 'effect', `${source}: rested ${piece.card.name}.`)
      return
    case 'weaken':
      piece.temp -= e.n
      log(s, side, 'effect', `${source}: ${piece.card.name} −${e.n} power this turn.`)
      return
    case 'bounce':
      removePiece(s, piece.uid, e.where === 'hand' ? 'hand' : 'bottom')
      log(s, side, 'effect', `${source}: ${piece.card.name} went ${e.where === 'hand' ? 'back to hand' : 'to the bottom of the deck'}.`)
      return
    case 'buff':
      if (e.battle) piece.battle += e.n
      else piece.temp += e.n
      log(s, side, 'effect', `${source}: ${piece.card.name} +${e.n} power this ${e.battle ? 'battle' : 'turn'}.`)
      return
  }
}

/** Runs effects in order; a target a person picks waits as a choice, and the rest run after it. */
function runEffects(s: GameState, side: Side, effects: Effect[], source: string) {
  for (let i = 0; i < effects.length; i++) {
    const e = effects[i]
    const legal = legalFor(s, side, e, s.battle?.target ?? null)
    const targeted = !['draw', 'addDon', 'playSelf'].includes(e.kind)
    if (targeted && legal.length === 0) {
      log(s, side, 'effect', `${source}: nothing to ${describeEffect(e)}.`)
      continue
    }
    if (targeted && s.humans.includes(side) && legal.length > 1) {
      s.choices.unshift({ kind: 'target', side, effect: e, legal, source, rest: effects.slice(i + 1), battle: !!s.battle })
      return
    }
    applyEffect(s, side, e, targeted ? (legal.length === 1 ? legal[0] : bestPick(s, e, legal)) : null, source)
    if (s.phase === 'over') return
  }
}

/** A card's text for a timing: run when the game reads it and the side isn't playing by hand, else logged for them. */
function runText(s: GameState, side: Side, card: Card, timing: Timing) {
  const section = sectionFor(card, timing)
  if (!section) return
  if (s.manual.includes(side) || section.effects.length === 0) {
    log(s, side, 'effect', `${card.name}: ${section.text}`, card)
    return
  }
  if (section.leftover) log(s, side, 'effect', `${card.name}, for you to do: ${section.leftover}`, card)
  runEffects(s, side, section.effects, card.name)
}

/** Pick a target for the waiting effect (null: none, "up to"). */
export function choose(state: GameState, side: Side, target: string | null): GameState {
  const c = state.choices[0]
  if (!c || c.kind !== 'target' || c.side !== side) return state
  const s = clone(state)
  s.choices.shift()
  if (target && c.legal.includes(target)) applyEffect(s, side, c.effect, target, c.source)
  if (s.phase !== 'over' && c.rest.length) runEffects(s, side, c.rest, c.source)
  return s
}

// ---------- removing pieces ----------

function removePiece(s: GameState, uid: string, to: 'trash' | 'hand' | 'bottom'): Piece | null {
  for (const p of s.players) {
    const i = p.characters.findIndex((c) => c.uid === uid)
    let piece: Piece | null = null
    if (i >= 0) piece = p.characters.splice(i, 1)[0]
    else if (p.stage?.uid === uid) {
      piece = p.stage
      p.stage = null
    }
    if (!piece) continue
    p.donRested += piece.don
    if (to === 'trash') p.trash.push(piece.card)
    else if (to === 'hand') p.hand.push(piece.card)
    else p.deck.push(piece.card)
    return piece
  }
  return null
}

function ko(s: GameState, uid: string, why: string) {
  const piece = removePiece(s, uid, 'trash')
  if (!piece) return
  log(s, piece.owner, 'battle', `${why}: ${piece.card.name} was K.O.'d.`)
  runText(s, piece.owner, piece.card, 'onKO')
}

// ---------- playing cards ----------

export function canPlay(s: GameState, side: Side, card: Card): boolean {
  if (s.phase !== 'main' || s.active !== side || s.battle || s.choices.length) return false
  if (!isCharacter(card) && !isStage(card) && !(isEvent(card) && sectionFor(card, 'main'))) return false
  return s.players[side].donActive >= costOf(card)
}

/** Play a card from hand, resting DON!! for its cost. A sixth Character needs `replace`: the one it trashes. */
export function play(state: GameState, side: Side, handIndex: number, options: { replace?: string } = {}): GameState {
  const card = state.players[side].hand[handIndex]
  if (!card || !canPlay(state, side, card)) return state
  if (isCharacter(card) && state.players[side].characters.length >= MAX_CHARACTERS && !state.players[side].characters.some((c) => c.uid === options.replace)) return state
  const s = clone(state)
  const p = s.players[side]
  p.hand.splice(handIndex, 1)
  const cost = costOf(card)
  p.donActive -= cost
  p.donRested += cost
  if (isCharacter(card)) {
    if (p.characters.length >= MAX_CHARACTERS && options.replace) {
      const out = removePiece(s, options.replace, 'trash')
      if (out) log(s, side, 'play', `${who(side)} trashed ${out.card.name} to make room.`)
    }
    p.characters.push(newPiece(s, card, side))
    log(s, side, 'play', `${who(side)} played ${card.name}.`, card)
    runText(s, side, card, 'onPlay')
  } else if (isStage(card)) {
    if (p.stage) p.trash.push(p.stage.card)
    p.stage = newPiece(s, card, side)
    log(s, side, 'play', `${who(side)} played the Stage ${card.name}.`, card)
    runText(s, side, card, 'onPlay')
  } else {
    p.trash.push(card)
    log(s, side, 'play', `${who(side)} played the Event ${card.name}.`, card)
    runText(s, side, card, 'main')
  }
  checkWin(s)
  return s
}

/** Give one of your active DON!! to your Leader or a Character. */
export function giveDon(state: GameState, side: Side, uid: string, n = 1): GameState {
  const target = findPiece(state, uid)
  if (state.phase !== 'main' || state.active !== side || state.battle || !target || target.owner !== side || state.players[side].stage?.uid === uid) return state
  if (state.players[side].donActive < n) return state
  const s = clone(state)
  s.players[side].donActive -= n
  findPiece(s, uid)!.don += n
  return s
}

// ---------- battles ----------

export function canAttackWith(s: GameState, side: Side, uid: string): boolean {
  const piece = findPiece(s, uid)
  if (s.phase !== 'main' || s.active !== side || s.battle || s.choices.length || !piece || piece.owner !== side || piece.rested) return false
  if (s.players[side].stage?.uid === uid) return false
  // Neither player battles on their first turn.
  if (s.players[side].turns <= 1) return false
  if (!isLeader(s, piece) && piece.playedTurn === s.turnNo && !piece.keywords.rush) return false
  return !s.players[other(side)].empty
}

/** What it can attack: the opponent's Leader, or one of their rested Characters. */
export function attackTargets(s: GameState, side: Side): string[] {
  const opp = s.players[other(side)]
  return [...(opp.leader ? [opp.leader.uid] : []), ...opp.characters.filter((c) => c.rested).map((c) => c.uid)]
}

export function attack(state: GameState, side: Side, attackerUid: string, targetUid: string): GameState {
  if (!canAttackWith(state, side, attackerUid) || !attackTargets(state, side).includes(targetUid)) return state
  const s = clone(state)
  const attacker = findPiece(s, attackerUid)!
  attacker.rested = true
  const target = findPiece(s, targetUid)!
  s.battle = { attacker: attackerUid, side, target: targetUid, step: 'block' }
  log(s, side, 'attack', `${who(side)} attacked ${target.card.name} with ${attacker.card.name} (${powerNow(s, attacker)} vs ${powerNow(s, target)}).`)
  runText(s, side, attacker.card, 'whenAttacking')
  if (s.battle && blockers(s).length === 0) s.battle.step = 'counter'
  return s
}

/** The defender's active Blockers that can step in. */
export function blockers(s: GameState): Piece[] {
  if (!s.battle) return []
  const def = s.players[other(s.battle.side)]
  return def.characters.filter((c) => c.keywords.blocker && !c.rested && c.uid !== s.battle!.target)
}

/** The defender blocks with a Blocker (rested, it becomes the target) or not (null). */
export function block(state: GameState, side: Side, blockerUid: string | null): GameState {
  const b = state.battle
  if (!b || b.step !== 'block' || side === b.side || state.choices.length) return state
  const s = clone(state)
  if (blockerUid) {
    const blocker = blockers(s).find((c) => c.uid === blockerUid)
    if (!blocker) return state
    blocker.rested = true
    s.battle!.target = blocker.uid
    log(s, side, 'battle', `${who(side)} blocked with ${blocker.card.name}.`)
  }
  s.battle!.step = 'counter'
  return s
}

/** Whether a card in hand can be used as a counter now: a Character's Counter value, or a [Counter] Event you can pay for. */
export function canCounter(s: GameState, side: Side, card: Card): boolean {
  const b = s.battle
  if (!b || b.step !== 'counter' || side === b.side || s.choices.length) return false
  if (isCharacter(card)) return counterOf(card) > 0
  return !!counterText(card) && s.players[side].donActive >= costOf(card)
}

export function counter(state: GameState, side: Side, handIndex: number): GameState {
  const card = state.players[side].hand[handIndex]
  if (!card || !canCounter(state, side, card)) return state
  const s = clone(state)
  const p = s.players[side]
  p.hand.splice(handIndex, 1)
  p.trash.push(card)
  const target = findPiece(s, s.battle!.target)!
  if (isCharacter(card)) {
    target.battle += counterOf(card)
    log(s, side, 'battle', `${who(side)} used ${card.name} as a counter: ${target.card.name} +${counterOf(card)}.`)
  } else {
    const cost = costOf(card)
    p.donActive -= cost
    p.donRested += cost
    log(s, side, 'battle', `${who(side)} played the Counter Event ${card.name}.`, card)
    runText(s, side, card, 'counter')
  }
  return s
}

/** The defender is done with counters: the battle is decided. */
export function resolveBattle(state: GameState, side: Side): GameState {
  const b = state.battle
  if (!b || b.step !== 'counter' || side === b.side || state.choices.length) return state
  const s = clone(state)
  const attacker = findPiece(s, b.attacker)
  const target = findPiece(s, b.target)
  if (attacker && target) {
    const a = powerNow(s, attacker)
    const d = powerNow(s, target)
    if (a < d) log(s, b.side, 'battle', `${target.card.name} held (${a} vs ${d}).`)
    else if (isLeader(s, target)) damageLeader(s, other(b.side), attacker)
    else ko(s, target.uid, `${attacker.card.name} won the battle (${a} vs ${d})`)
  }
  if (s.phase !== 'over') {
    s.battle = null
    for (const x of pieces(s)) x.battle = 0
  }
  checkWin(s)
  return s
}

function damageLeader(s: GameState, side: Side, attacker: Piece) {
  const p = s.players[side]
  if (p.life.length === 0) {
    win(s, other(side), `${attacker.card.name} hit a Leader with no Life left.`)
    return
  }
  const hits = Math.min(attacker.keywords.doubleAttack ? 2 : 1, p.life.length)
  for (let i = 0; i < hits; i++) {
    const card = p.life.pop()!
    if (attacker.keywords.banish) {
      p.trash.push(card)
      log(s, side, 'battle', `${who(side)} took a hit: a Life card was trashed (Banish).`)
    } else if (sectionFor(card, 'trigger')) {
      s.choices.push({ kind: 'trigger', side, card })
      log(s, side, 'battle', `${who(side)} took a hit: a Life card with a Trigger.`)
    } else {
      p.hand.push(card)
      log(s, side, 'battle', `${who(side)} took a hit: a Life card went to hand.`)
    }
  }
}

/** A Life card's Trigger: use it (reveal, run its [Trigger], then trash it unless it's played) or add the card to hand. */
export function resolveTrigger(state: GameState, side: Side, use: boolean): GameState {
  const c = state.choices[0]
  if (!c || c.kind !== 'trigger' || c.side !== side) return state
  const s = clone(state)
  s.choices.shift()
  const p = s.players[side]
  if (!use) {
    p.hand.push(c.card)
    return s
  }
  const section = sectionFor(c.card, 'trigger')!
  log(s, side, 'effect', `${who(side)} used the Trigger of ${c.card.name}.`, c.card)
  const playsSelf = section.effects.some((e) => e.kind === 'playSelf') && !s.manual.includes(side)
  if (playsSelf && isCharacter(c.card) && p.characters.length < MAX_CHARACTERS) {
    p.characters.push(newPiece(s, c.card, side))
    runText(s, side, c.card, 'onPlay')
  } else if (playsSelf && isStage(c.card)) {
    if (p.stage) p.trash.push(p.stage.card)
    p.stage = newPiece(s, c.card, side)
  } else p.trash.push(c.card)
  runText(s, side, c.card, 'trigger')
  return s
}

/** Whose move it is: a waiting choice's side, the defender during a battle, else the active player. */
export function toMove(s: GameState): Side | null {
  if (s.phase === 'over') return null
  if (s.phase === 'mulligan') return s.kept.includes(0) ? 1 : 0
  if (s.choices.length) return s.choices[0].side
  if (s.battle) return other(s.battle.side)
  return s.active
}

// ---------- tools: doing card text by hand ----------

export type Tool =
  | { kind: 'ko'; uid: string }
  | { kind: 'toHand'; uid: string }
  | { kind: 'toBottom'; uid: string }
  | { kind: 'power'; uid: string; n: number; lasting: boolean }
  | { kind: 'rest'; uid: string }
  | { kind: 'activate'; uid: string }
  | { kind: 'draw'; side: Side }
  | { kind: 'trashFromHand'; side: Side; index: number }
  | { kind: 'handToBottom'; side: Side; index: number }
  | { kind: 'lifeToHand'; side: Side }
  | { kind: 'deckToLife'; side: Side }
  | { kind: 'fromTrash'; side: Side; index: number }
  | { kind: 'playFree'; side: Side; index: number }
  | { kind: 'addDon'; side: Side; active: boolean }
  | { kind: 'returnDon'; side: Side }
  | { kind: 'restDon'; side: Side }
  | { kind: 'trashTop'; side: Side }
  | { kind: 'shuffle'; side: Side }

export function applyTool(state: GameState, tool: Tool, random: () => number = Math.random): GameState {
  if (state.phase === 'over') return state
  const s = clone(state)
  const piece = 'uid' in tool ? findPiece(s, tool.uid) : null
  const p = 'side' in tool ? s.players[tool.side] : null
  const side = 'side' in tool ? tool.side : (piece?.owner ?? 0)
  const name = piece?.card.name ?? ''
  switch (tool.kind) {
    case 'ko':
      if (!piece || isLeader(s, piece)) return state
      ko(s, piece.uid, 'Tool')
      break
    case 'toHand':
    case 'toBottom':
      if (!piece || isLeader(s, piece)) return state
      removePiece(s, piece.uid, tool.kind === 'toHand' ? 'hand' : 'bottom')
      log(s, side, 'tool', `${name} went ${tool.kind === 'toHand' ? 'back to hand' : 'to the bottom of the deck'}.`)
      break
    case 'power':
      if (!piece) return state
      if (tool.lasting) piece.bonus += tool.n
      else piece.temp += tool.n
      log(s, side, 'tool', `${name} ${tool.n > 0 ? '+' : '−'}${Math.abs(tool.n)} power${tool.lasting ? '' : ' this turn'}.`)
      break
    case 'rest':
    case 'activate':
      if (!piece) return state
      piece.rested = tool.kind === 'rest'
      log(s, side, 'tool', `${name} ${tool.kind === 'rest' ? 'rested' : 'set active'}.`)
      break
    case 'draw':
      draw(s, side)
      log(s, side, 'tool', `${who(side)} drew a card.`)
      break
    case 'trashFromHand':
    case 'handToBottom': {
      const [card] = p!.hand.splice(tool.index, 1)
      if (!card) return state
      if (tool.kind === 'trashFromHand') p!.trash.push(card)
      else p!.deck.push(card)
      log(s, side, 'tool', `${who(side)} ${tool.kind === 'trashFromHand' ? 'trashed' : 'put on the bottom of the deck'} ${card.name} from hand.`)
      break
    }
    case 'lifeToHand': {
      const card = p!.life.pop()
      if (!card) return state
      p!.hand.push(card)
      log(s, side, 'tool', `${who(side)} added a Life card to hand.`)
      break
    }
    case 'deckToLife': {
      const card = p!.deck.shift()
      if (!card) return state
      p!.life.push(card)
      log(s, side, 'tool', `${who(side)} added the top of the deck to Life.`)
      break
    }
    case 'fromTrash': {
      const [card] = p!.trash.splice(tool.index, 1)
      if (!card) return state
      p!.hand.push(card)
      log(s, side, 'tool', `${who(side)} took ${card.name} from the trash.`)
      break
    }
    case 'playFree': {
      const card = p!.hand[tool.index]
      if (!card || !(isCharacter(card) || isStage(card))) return state
      if (isCharacter(card) && p!.characters.length >= MAX_CHARACTERS) return state
      p!.hand.splice(tool.index, 1)
      if (isCharacter(card)) p!.characters.push(newPiece(s, card, side))
      else {
        if (p!.stage) p!.trash.push(p!.stage.card)
        p!.stage = newPiece(s, card, side)
      }
      log(s, side, 'tool', `${who(side)} played ${card.name} for free.`, card)
      break
    }
    case 'addDon':
      if (p!.donDeck === 0) return state
      p!.donDeck -= 1
      if (tool.active) p!.donActive += 1
      else p!.donRested += 1
      log(s, side, 'tool', `${who(side)} added a DON!! ${tool.active ? 'active' : 'rested'}.`)
      break
    case 'returnDon':
      if (p!.donRested > 0) p!.donRested -= 1
      else if (p!.donActive > 0) p!.donActive -= 1
      else return state
      p!.donDeck += 1
      log(s, side, 'tool', `${who(side)} returned a DON!! to the DON!! deck.`)
      break
    case 'restDon':
      if (p!.donActive === 0) return state
      p!.donActive -= 1
      p!.donRested += 1
      log(s, side, 'tool', `${who(side)} rested a DON!!.`)
      break
    case 'trashTop': {
      const card = p!.deck.shift()
      if (!card) return state
      p!.trash.push(card)
      log(s, side, 'tool', `${who(side)} trashed ${card.name} from the top of the deck.`)
      break
    }
    case 'shuffle':
      p!.deck = shuffled(p!.deck, random)
      log(s, side, 'tool', `${who(side)} shuffled the deck.`)
      break
  }
  checkWin(s)
  return s
}
