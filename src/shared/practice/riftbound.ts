import type { Card } from '../types'
import { describeEffect, needsChoice, scriptOf, type Effect, type Target, type Trigger } from './riftboundEffects'

/**
 * A Riftbound practice game: the board, turns, paying with runes, moving, showdowns, combat and
 * scoring, from the Core Rules (Duel: 2 battlefields, 8 points to win). Card text it can read
 * (riftboundEffects.ts) runs by itself: spells' effects, and units' "When you play me / When I attack,
 * defend, conquer, hold, move" and Deathknell abilities. Anything else is logged with its text for
 * you to apply with the manual tools (damage, Might, kill, points...). Keywords it runs: Accelerate,
 * Assault, Shield, Tank, Backline, Ganking, Temporary.
 *
 * Moving into enemy units opens a showdown: the defender, then each player in turn, may cast an
 * [Action] or [Reaction] spell or pass; two passes in a row and combat happens.
 *
 * Every action takes a state and returns a new one (the old one is untouched), so the board keeps a
 * history for Undo and the bot can try moves out. `random` is injectable so tests are repeatable.
 *
 * Left out, on purpose: counters and chains (a spell resolves when cast), Hidden (played face up),
 * Legion, Equip, Level, and costs that cards change.
 */

export type Side = 0 | 1
export const other = (side: Side): Side => (side === 0 ? 1 : 0)
export const VICTORY_SCORE = 8

export interface Keywords {
  assault: number
  shield: number
  tank: boolean
  backline: boolean
  ganking: boolean
  accelerate: boolean
  temporary: boolean
}

export interface Unit {
  uid: string
  card: Card
  owner: Side
  /** Printed Might, or a stand-in when the card data has none (see mightOf). */
  might: number
  /** +Might that lasts (the tools). */
  bonus: number
  /** +/- Might this turn (spells, triggers). */
  temp: number
  /** A buff counter: +1 Might while it's there (one per unit). */
  buffed: boolean
  damage: number
  exhausted: boolean
  stunned: boolean
  token: boolean
  keywords: Keywords
}

export interface Rune {
  uid: string
  domain: string
  exhausted: boolean
}

export interface Player {
  deck: Card[]
  hand: Card[]
  trash: Card[]
  base: Unit[]
  /** Gear on the board (in base), with whether it's exhausted. */
  gear: { uid: string; card: Card; exhausted: boolean }[]
  runeDeck: string[]
  runes: Rune[]
  points: number
  legend: Card | null
  legendExhausted: boolean
  /** The Chosen Champion while it waits in the Champion Zone (null once played). */
  champion: Card | null
  /** True for a side with nobody playing it (goldfishing): it never takes turns. */
  empty: boolean
}

export interface Battlefield {
  card: Card | null
  controller: Side | null
  units: Unit[]
  /** Sides that scored this battlefield this turn (each battlefield scores once a turn). */
  scored: Side[]
  /** Cards hidden here face down ([Hidden]), by owner. */
  hidden: { uid: string; owner: Side; card: Card }[]
}

/** Units moved into enemy units: before combat, each player may cast Actions and Reactions in turn. */
export interface Showdown {
  battlefield: number
  attacker: Side
  /** Whose move it is: cast an Action/Reaction, or pass. */
  focus: Side
  /** Passes in a row; two and combat happens. */
  passes: number
}

export type LogKind = 'turn' | 'play' | 'move' | 'combat' | 'score' | 'spell' | 'effect' | 'tool' | 'info' | 'win'

export interface LogEntry {
  turn: number
  side: Side
  kind: LogKind
  text: string
  /** A card to show next to it (a spell's text left to you, what was played). */
  card?: Card
}

export interface GameState {
  players: [Player, Player]
  battlefields: Battlefield[]
  /** Round number: both players have had `turn - 1` full turns. */
  turn: number
  active: Side
  first: Side
  /** 'mulligan' until both players have kept, then 'main' (the active player's Main Phase), 'over' at the end. */
  phase: 'mulligan' | 'main' | 'over'
  showdown: Showdown | null
  /**
   * Sides playing by hand, like at a table: their turn steps (ready, channel, draw), moves (no
   * combat or conquering), scoring and card text are theirs to do. The game still keeps the board,
   * pays costs, and runs the other side.
   */
  manual: Side[]
  /** Sides that have finished their mulligan. */
  kept: Side[]
  winner: Side | null
  log: LogEntry[]
  nextUid: number
}

export interface DeckSetup {
  /** The main deck, one entry per copy, without the Chosen Champion. */
  main: Card[]
  champion: Card | null
  legend: Card | null
  /** Up to 3; one is picked at random for the game. */
  battlefields: Card[]
  /** 12 domain names, one per rune ("Fury", "Calm"...). */
  runes: string[]
}

/**
 * Picks the unit an effect goes to (null: none, or chose not to). The bot's chooser picks the best;
 * yours comes from what you clicked. Triggered abilities use the owner's best pick.
 */
export type Chooser = (effect: Effect, legal: Unit[]) => Unit | null

// ---------- reading cards ----------

/** A unit's keywords, read from its text ("[Assault 2]", "[Tank]"...). */
export function keywordsOf(card: Card): Keywords {
  const text = card.text ?? ''
  const num = (name: string) => {
    const m = new RegExp(`\\[${name}(?: (\\d+))?\\]`, 'i').exec(text)
    return m ? Number(m[1] ?? 1) : 0
  }
  const has = (name: string) => new RegExp(`\\[${name}\\]`, 'i').test(text)
  return {
    assault: num('Assault'),
    shield: num('Shield'),
    tank: has('Tank'),
    backline: has('Backline'),
    ganking: has('Ganking'),
    accelerate: has('Accelerate'),
    temporary: has('Temporary'),
  }
}

/** A unit's Might: from the card data, else (card data synced before it had Might) its Energy cost, as a stand-in. */
export function mightOf(card: Card): number {
  if (typeof card.might === 'number') return card.might
  const cost = Number.parseInt(card.cost ?? '', 10)
  return Number.isFinite(cost) ? Math.max(1, cost) : 1
}

export const energyCost = (card: Card): number => {
  const n = Number.parseInt(card.cost ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

export const powerCost = (card: Card): number => card.powerCost ?? 0

export const isUnit = (card: Card) => card.category === 'Unit' || card.category === 'Champion'
export const isGear = (card: Card) => card.category === 'Gear'
export const isSpell = (card: Card) => card.category === 'Spell'

/** A unit's Might right now: printed, kept bonuses, this turn's, and its buff. */
export const mightNow = (u: Unit): number => Math.max(0, u.might + u.bonus + u.temp + (u.buffed ? 1 : 0))

/** A unit's Might in a combat: plus Assault when attacking or Shield when defending. */
export function combatMight(u: Unit, attacking: boolean): number {
  return mightNow(u) + (attacking ? u.keywords.assault : u.keywords.shield)
}

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
  return { deck: [], hand: [], trash: [], base: [], gear: [], runeDeck: [], runes: [], points: 0, legend: null, legendExhausted: false, champion: null, empty }
}

/**
 * A copy to change: everything that changes is copied, the cards themselves (which never do) are
 * shared. Much faster than a deep copy, which matters when the bot tries out hundreds of moves.
 */
function clone(state: GameState): GameState {
  const unit = (u: Unit): Unit => ({ ...u, keywords: u.keywords })
  const player = (p: Player): Player => ({
    ...p,
    deck: [...p.deck],
    hand: [...p.hand],
    trash: [...p.trash],
    base: p.base.map(unit),
    gear: p.gear.map((g) => ({ ...g })),
    runeDeck: [...p.runeDeck],
    runes: p.runes.map((r) => ({ ...r })),
  })
  return {
    ...state,
    players: [player(state.players[0]), player(state.players[1])],
    battlefields: state.battlefields.map((b) => ({ ...b, units: b.units.map(unit), scored: [...b.scored], hidden: [...(b.hidden ?? [])] })),
    showdown: state.showdown ? { ...state.showdown } : null,
    kept: [...state.kept],
    log: [...state.log],
  }
}

const who = (side: Side) => (side === 0 ? 'You' : 'Opponent')

function log(state: GameState, side: Side, kind: LogKind, text: string, card?: Card) {
  state.log.push({ turn: state.turn, side, kind, text, ...(card ? { card } : {}) })
}

function uid(state: GameState): string {
  state.nextUid += 1
  return `u${state.nextUid}`
}

/**
 * A new game: decks shuffled, each player's battlefield picked at random from their three (an empty
 * side brings none, so you get two of yours), four cards each, waiting for mulligans. `opponent` null
 * is playing alone: nobody on the other side.
 */
export function newGame(you: DeckSetup, opponent: DeckSetup | null, options: { first?: Side; random?: () => number; manual?: boolean } = {}): GameState {
  const random = options.random ?? Math.random
  const players: [Player, Player] = [emptyPlayer(false), emptyPlayer(opponent == null)]
  const setups: [DeckSetup, DeckSetup | null] = [you, opponent]
  setups.forEach((setup, i) => {
    if (!setup) return
    const p = players[i]
    p.deck = shuffled(setup.main, random)
    p.runeDeck = shuffled(setup.runes, random)
    p.legend = setup.legend
    p.champion = setup.champion
    p.hand = p.deck.splice(0, 4)
  })
  const picks = [you.battlefields, opponent?.battlefields ?? []].map((bfs) => shuffled(bfs, random))
  const chosen: (Card | undefined)[] = opponent ? [picks[0][0], picks[1][0]] : picks[0].slice(0, 2)
  while (chosen.length < 2) chosen.push(undefined)
  const first: Side = opponent ? (options.first ?? (random() < 0.5 ? 0 : 1)) : 0
  const state: GameState = {
    players,
    battlefields: chosen.map((card) => ({ card: card ?? null, controller: null, units: [], scored: [], hidden: [] })),
    turn: 1,
    active: first,
    first,
    phase: 'mulligan',
    showdown: null,
    manual: options.manual ? [0] : [],
    kept: opponent ? [] : [1],
    winner: null,
    log: [],
    nextUid: 0,
  }
  log(state, first, 'info', first === 0 ? 'You go first.' : 'Your opponent goes first.')
  return state
}

/**
 * A mulligan: up to two cards from the hand go aside, as many are drawn, then the set-aside ones go
 * to the bottom of the deck. Once both players have kept, the first turn starts.
 */
export function mulligan(state: GameState, side: Side, handIndexes: number[]): GameState {
  if (state.phase !== 'mulligan' || state.kept.includes(side)) return state
  const s = clone(state)
  const p = s.players[side]
  const picked = [...new Set(handIndexes)].filter((i) => i >= 0 && i < p.hand.length).slice(0, 2)
  const aside = picked.map((i) => p.hand[i])
  p.hand = p.hand.filter((_, i) => !picked.includes(i))
  p.hand.push(...p.deck.splice(0, aside.length))
  p.deck.push(...aside)
  s.kept.push(side)
  log(s, side, 'info', aside.length ? `${who(side)} mulliganed ${aside.length}.` : `${who(side)} kept.`)
  return s.kept.length === 2 ? startTurn(s) : s
}

// ---------- the board ----------

export function allUnits(s: GameState, side?: Side): Unit[] {
  const units = [...s.players[0].base, ...s.players[1].base, ...s.battlefields.flatMap((b) => b.units)]
  return side == null ? units : units.filter((u) => u.owner === side)
}

export function bfName(state: GameState, index: number): string {
  return state.battlefields[index]?.card?.name ?? `Battlefield ${index + 1}`
}

/** Where a unit is: 'base' or a battlefield index, or null when it isn't on the board. */
export function whereIs(state: GameState, unitUid: string): 'base' | number | null {
  if (state.players.some((p) => p.base.some((u) => u.uid === unitUid))) return 'base'
  const i = state.battlefields.findIndex((b) => b.units.some((u) => u.uid === unitUid))
  return i >= 0 ? i : null
}

function takeUnit(s: GameState, unitUid: string): Unit | null {
  for (const p of s.players) {
    const i = p.base.findIndex((u) => u.uid === unitUid)
    if (i >= 0) return p.base.splice(i, 1)[0]
  }
  for (const bf of s.battlefields) {
    const i = bf.units.findIndex((u) => u.uid === unitUid)
    if (i >= 0) return bf.units.splice(i, 1)[0]
  }
  return null
}

function checkWin(s: GameState) {
  if (s.phase === 'over') return
  const [a, b] = [s.players[0].points, s.players[1].points]
  if (Math.max(a, b) >= VICTORY_SCORE && a !== b) {
    s.phase = 'over'
    s.showdown = null
    s.winner = a > b ? 0 : 1
    log(s, s.winner, 'win', s.winner === 0 ? 'You win!' : 'Your opponent wins.')
  }
}

function draw(s: GameState, side: Side, n = 1) {
  const p = s.players[side]
  for (let i = 0; i < n; i++) {
    if (!p.deck.length) {
      // Burn Out: the trash becomes the deck, and the opponent scores a point.
      if (!p.trash.length) return
      p.deck = shuffled(p.trash, Math.random)
      p.trash = []
      s.players[other(side)].points += 1
      log(s, side, 'score', 'Burned out: the trash is shuffled back in, and the opponent scores 1.')
      checkWin(s)
    }
    const card = p.deck.shift()
    if (card) p.hand.push(card)
  }
}

// ---------- effects ----------

/** The units an effect could go to, for `side` casting it from `here` (a battlefield index, or null). */
export function legalTargets(s: GameState, side: Side, target: Target, here: number | null, source?: string): Unit[] {
  if (target.self) {
    const me = source ? allUnits(s).find((u) => u.uid === source) : undefined
    return me ? [me] : []
  }
  let units: Unit[]
  if (target.where === 'here') units = here == null ? [] : s.battlefields[here].units
  else if (target.where === 'battlefield') units = s.battlefields.flatMap((b) => b.units)
  else units = allUnits(s)
  return units.filter(
    (u) =>
      (target.who === 'any' || (target.who === 'enemy' ? u.owner !== side : u.owner === side)) &&
      (target.maxMight == null || mightNow(u) <= target.maxMight) &&
      (target.who !== 'friendly' || !source || u.uid !== source || true),
  )
}

/** The best unit for an effect, for `side`: what the bot picks, and what triggered abilities pick for anyone. */
export function bestTarget(side: Side): Chooser {
  return (effect, legal) => {
    const mine = legal.filter((u) => u.owner === side)
    const theirs = legal.filter((u) => u.owner !== side)
    const strongest = (us: Unit[]) => [...us].sort((a, b) => mightNow(b) - mightNow(a))[0] ?? null
    switch (effect.kind) {
      case 'damage': {
        // The biggest enemy it kills, else the biggest enemy; never your own if there's a choice.
        const kills = theirs.filter((u) => mightNow(u) - u.damage <= effect.amount)
        return strongest(kills) ?? strongest(theirs) ?? null
      }
      case 'kill':
      case 'stun':
      case 'exhaust':
      case 'toHand':
        return strongest(theirs.filter((u) => effect.kind !== 'exhaust' || !u.exhausted)) ?? null
      case 'might':
        return effect.amount >= 0 ? (strongest(mine.filter((u) => !u.exhausted)) ?? strongest(mine)) : strongest(theirs)
      case 'ready':
        return strongest(mine.filter((u) => u.exhausted)) ?? null
      case 'buff':
        return strongest(mine.filter((u) => !u.buffed)) ?? null
      default:
        return null
    }
  }
}

function newUnit(s: GameState, card: Card, owner: Side, exhausted: boolean, token = false): Unit {
  return { uid: uid(s), card, owner, might: mightOf(card), bonus: 0, temp: 0, buffed: false, damage: 0, exhausted, stunned: false, token, keywords: keywordsOf(card) }
}

/** Whether a unit has as much damage as Might: it dies. */
const lethal = (u: Unit) => u.damage > 0 && u.damage >= mightNow(u)

/**
 * Runs effects for `side`. `here` is the battlefield of the card or unit they come from, `source`
 * that unit. Each effect that needs a unit gets one from `choose` (null skips it). Units that end up
 * with lethal damage die at the end.
 */
export function runEffects(s: GameState, side: Side, effects: Effect[], choose: Chooser, here: number | null, source?: string) {
  for (const effect of effects) {
    if (s.phase === 'over') return
    let targets: Unit[] = []
    if ('target' in effect) {
      const legal = legalTargets(s, side, effect.target, here, source)
      if (effect.target.all || effect.target.self) targets = legal
      else {
        const pick = choose(effect, legal)
        if (pick && legal.some((u) => u.uid === pick.uid)) targets = [legal.find((u) => u.uid === pick.uid)!]
      }
      if (!targets.length) continue
    }
    const names = targets.map((u) => u.card.name).join(', ')
    switch (effect.kind) {
      case 'damage':
        for (const u of targets) u.damage += effect.amount
        break
      case 'might':
        for (const u of targets) {
          const before = mightNow(u)
          u.temp += effect.amount
          if (effect.amount < 0 && effect.floor != null && mightNow(u) < Math.min(before, effect.floor)) u.temp += Math.min(before, effect.floor) - mightNow(u)
        }
        break
      case 'stun':
        for (const u of targets) u.stunned = true
        break
      case 'kill':
        for (const u of targets) kill(s, u.uid)
        break
      case 'ready':
        for (const u of targets) u.exhausted = false
        break
      case 'exhaust':
        for (const u of targets) u.exhausted = true
        break
      case 'toHand':
        for (const u of targets) {
          takeUnit(s, u.uid)
          if (!u.token) s.players[u.owner].hand.push(u.card)
        }
        break
      case 'buff':
        for (const u of targets) u.buffed = true
        break
      case 'draw':
        draw(s, side, effect.amount)
        break
      case 'discard': {
        const p = s.players[side]
        // The cheapest cards go (what a player would usually let go of).
        for (let i = 0; i < effect.amount && p.hand.length; i++) {
          const at = p.hand.reduce((best, c, j) => (energyCost(c) < energyCost(p.hand[best]) ? j : best), 0)
          p.trash.push(...p.hand.splice(at, 1))
        }
        break
      }
      case 'channel': {
        const p = s.players[side]
        for (let i = 0; i < effect.amount && p.runeDeck.length; i++) p.runes.push({ uid: uid(s), domain: p.runeDeck.shift()!, exhausted: effect.exhausted })
        break
      }
      case 'token': {
        const card: Card = {
          id: `riftbound:token-${effect.name.toLowerCase()}`,
          gameId: 'riftbound',
          sourceId: 'token',
          name: `${effect.name} token`,
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
          cost: '0',
          might: effect.might,
          text: effect.temporary ? '[Temporary]' : null,
          legality: null,
        }
        for (let i = 0; i < effect.count; i++) {
          const unit = newUnit(s, card, side, !effect.ready, true)
          if (effect.here && here != null) s.battlefields[here].units.push(unit)
          else s.players[side].base.push(unit)
        }
        break
      }
    }
    log(s, side, 'effect', `${describeEffect(effect)}${names ? `: ${names}` : ''}.`)
  }
  // Damage that reaches a unit's Might kills it (combat damage waits for combat).
  if (!s.showdown) for (const u of allUnits(s).filter(lethal)) kill(s, u.uid, 'damage')
}

/** A unit's triggered abilities of one kind, run with its owner's best picks. */
function trigger(s: GameState, unit: Unit, kind: Trigger) {
  const abilities = scriptOf(unit.card).abilities.filter((a) => a.trigger === kind)
  if (!abilities.length) return
  const here = whereIs(s, unit.uid)
  for (const a of abilities) {
    log(s, unit.owner, 'effect', `${unit.card.name}: ${kind === 'death' ? 'Deathknell' : `when ${kind === 'play' ? 'played' : kind === 'attack' ? 'it attacks' : kind === 'defend' ? 'it defends' : kind === 'conquer' ? 'it conquers' : kind === 'hold' ? 'it holds' : 'it moves'}`}.`)
    runEffects(s, unit.owner, a.effects, bestTarget(unit.owner), typeof here === 'number' ? here : null, unit.uid)
  }
}

function kill(s: GameState, unitUid: string, why?: string) {
  const unit = takeUnit(s, unitUid)
  if (!unit) return
  // Tokens leave the game; cards go to their owner's trash.
  if (!unit.token) s.players[unit.owner].trash.push(unit.card)
  if (why) log(s, unit.owner, 'tool', `${unit.card.name} died (${why}).`)
  const deathknell = scriptOf(unit.card).abilities.filter((a) => a.trigger === 'death')
  for (const a of deathknell) {
    log(s, unit.owner, 'effect', `${unit.card.name}: Deathknell.`)
    runEffects(s, unit.owner, a.effects, bestTarget(unit.owner), null)
  }
}

// ---------- turns ----------

/** The active player's turn up to their Main Phase: Awaken, Beginning (Temporary dies, then Hold), Channel, Draw. */
function startTurn(state: GameState): GameState {
  const s = state
  s.phase = 'main'
  const side = s.active
  const p = s.players[side]
  log(s, side, 'turn', side === 0 ? `Your turn ${s.turn}` : `Opponent's turn ${s.turn}`)
  if (s.manual.includes(side)) {
    log(s, side, 'info', 'Ready your cards, score what you hold, channel your runes and draw (Start of turn readies, channels and draws for you).')
    return s
  }
  // Awaken: ready everything.
  for (const u of allUnits(s, side)) u.exhausted = false
  for (const r of p.runes) r.exhausted = false
  for (const g of p.gear) g.exhausted = false
  p.legendExhausted = false
  // Beginning: Temporary units die, then hold every battlefield you control.
  for (const u of allUnits(s, side).filter((x) => x.keywords.temporary)) kill(s, u.uid, 'Temporary')
  s.battlefields.forEach((bf, i) => {
    if (bf.controller === side && !bf.scored.includes(side)) {
      bf.scored.push(side)
      p.points += 1
      log(s, side, 'score', `${who(side)} held ${bfName(s, i)}: +1 (${p.points}).`)
      for (const u of bf.units.filter((x) => x.owner === side)) trigger(s, u, 'hold')
    }
  })
  checkWin(s)
  if ((s.phase as GameState['phase']) === 'over') return s
  // Channel 2 runes (3 on the second player's first turn), then draw 1.
  const channel = s.turn === 1 && side !== s.first ? 3 : 2
  for (let i = 0; i < channel && p.runeDeck.length; i++) p.runes.push({ uid: uid(s), domain: p.runeDeck.shift()!, exhausted: false })
  draw(s, side)
  return s
}

/**
 * The start of a turn played by hand, in one go: ready everything, Temporary units die, channel 2
 * runes (3 on the second player's first turn) and draw 1. Holding is left to you (add the points).
 */
export function startOfTurn(state: GameState, side: Side): GameState {
  if (state.phase !== 'main' || state.active !== side) return state
  const s = clone(state)
  const p = s.players[side]
  for (const u of allUnits(s, side)) u.exhausted = false
  for (const r of p.runes) r.exhausted = false
  for (const g of p.gear) g.exhausted = false
  for (const u of allUnits(s, side).filter((x) => x.keywords.temporary)) kill(s, u.uid, 'Temporary')
  const channel = s.turn === 1 && side !== s.first ? 3 : 2
  for (let i = 0; i < channel && p.runeDeck.length; i++) p.runes.push({ uid: uid(s), domain: p.runeDeck.shift()!, exhausted: false })
  draw(s, side)
  log(s, side, 'info', `${who(side)} readied, channelled ${channel} and drew 1.`)
  return s
}

/** Ends the active player's turn: units heal, "this turn" ends, and the other player's turn starts (unless nobody's there). */
export function endTurn(state: GameState): GameState {
  if (state.phase !== 'main' || state.showdown) return state
  const s = clone(state)
  for (const u of allUnits(s)) {
    u.damage = 0
    u.stunned = false
    u.temp = 0
  }
  for (const bf of s.battlefields) bf.scored = []
  const next = other(s.active)
  if (next === s.first || s.players[next].empty) s.turn += 1
  s.active = s.players[next].empty ? s.active : next
  return startTurn(s)
}

// ---------- paying ----------

/** Whether `side` can pay `energy` and `power` (of any of `domains`) with its runes. */
export function canPay(state: GameState, side: Side, energy: number, power: number, domains: readonly string[]): boolean {
  return payment(state.players[side], energy, power, domains) != null
}

/**
 * Which runes pay: Power first, recycling runes of a matching domain (exhausted ones before ready
 * ones, which can still give Energy), then Energy, exhausting ready runes. Null when it can't be paid.
 */
function payment(p: Player, energy: number, power: number, domains: readonly string[]): { recycle: string[]; exhaust: string[] } | null {
  const matching = (r: Rune) => !domains.length || domains.includes(r.domain) || domains.includes('Colorless')
  const forPower = p.runes.filter(matching).sort((a, b) => Number(b.exhausted) - Number(a.exhausted)).slice(0, power)
  if (forPower.length < power) return null
  const used = new Set(forPower.map((r) => r.uid))
  const forEnergy = p.runes.filter((r) => !r.exhausted && !used.has(r.uid)).slice(0, energy)
  if (forEnergy.length < energy) return null
  return { recycle: forPower.map((r) => r.uid), exhaust: forEnergy.map((r) => r.uid) }
}

function pay(s: GameState, side: Side, energy: number, power: number, domains: readonly string[]): boolean {
  const p = s.players[side]
  const plan = payment(p, energy, power, domains)
  if (!plan) return false
  for (const id of plan.exhaust) p.runes.find((r) => r.uid === id)!.exhausted = true
  for (const id of plan.recycle) {
    const rune = p.runes.find((r) => r.uid === id)!
    p.runes = p.runes.filter((r) => r.uid !== id)
    p.runeDeck.push(rune.domain)
  }
  return true
}

// ---------- playing ----------

export interface PlayOptions {
  /** Pay Accelerate (1 Energy and 1 Power more) so the unit enters ready. */
  accelerate?: boolean
  /** A battlefield you control to play the unit to, instead of your base. */
  battlefield?: number
  /** Play it without paying (an effect put it into play). */
  free?: boolean
  /** The units picked for the card's effects that need one, in order (null skips one). Missing ones are picked for you. */
  targets?: (string | null)[]
}

/** The cost of a card as played: Energy and Power, with Accelerate's extra when asked for. */
export function costOf(card: Card, accelerate = false): { energy: number; power: number } {
  return { energy: energyCost(card) + (accelerate ? 1 : 0), power: powerCost(card) + (accelerate ? 1 : 0) }
}

/** Whether `side` may play `card` now: on their own turn, or in a showdown with the focus if it's an Action or Reaction. */
export function canPlay(state: GameState, side: Side, card: Card, accelerate = false): boolean {
  if (state.phase !== 'main') return false
  if (state.showdown) {
    if (state.showdown.focus !== side || !isSpell(card) || !scriptOf(card).timing) return false
  } else if (state.active !== side) return false
  if (accelerate && !keywordsOf(card).accelerate) return false
  const { energy, power } = costOf(card, accelerate)
  return canPay(state, side, energy, power, card.colors)
}

/** The effects of a card that need a unit picked when it's played: a spell's, or a unit's "When you play me". */
export function playChoices(card: Card): Effect[] {
  const script = scriptOf(card)
  if (!script.full) return []
  const effects = isSpell(card) ? script.spell : script.abilities.filter((a) => a.trigger === 'play').flatMap((a) => a.effects)
  return effects.filter(needsChoice)
}

/** A chooser that takes the given picks in order, and the best one for anything not given. */
function fromPicks(side: Side, picks: (string | null)[] | undefined): Chooser {
  const best = bestTarget(side)
  let i = 0
  return (effect, legal) => {
    if (!needsChoice(effect)) return best(effect, legal)
    if (picks && i < picks.length) {
      const id = picks[i++]
      return id ? (legal.find((u) => u.uid === id) ?? null) : null
    }
    return best(effect, legal)
  }
}

/**
 * Plays the card at `handIndex` (or the Champion from its zone, with -1): pays for it, then a unit or
 * gear goes to base (a unit exhausted unless Accelerated or it enters ready), a spell resolves. What
 * the game can read runs; anything else goes to the log for you.
 */
export function play(state: GameState, side: Side, handIndex: number, options: PlayOptions = {}): GameState {
  const p0 = state.players[side]
  const card = handIndex === -1 ? p0.champion : p0.hand[handIndex]
  if (!card || state.phase !== 'main') return state
  if (!options.free && !canPlay(state, side, card, options.accelerate)) return state
  const accelerate = !!options.accelerate && keywordsOf(card).accelerate && isUnit(card)
  const s = clone(state)
  const p = s.players[side]
  if (!options.free) {
    const { energy, power } = costOf(card, accelerate)
    if (!pay(s, side, energy, power, card.colors)) return state
  }
  if (handIndex === -1) p.champion = null
  else p.hand.splice(handIndex, 1)
  // Played by hand: the card's text is yours to resolve, so nothing of it runs.
  const script = s.manual.includes(side) ? { ...scriptOf(card), spell: [], abilities: [], full: false } : scriptOf(card)
  const choose = fromPicks(side, options.targets)
  if (isUnit(card)) {
    const unit = newUnit(s, card, side, !accelerate && !script.entersReady)
    const bf = options.battlefield != null ? s.battlefields[options.battlefield] : null
    if (bf && (bf.controller === side || s.manual.includes(side))) {
      bf.units.push(unit)
      log(s, side, 'play', `${who(side)} played ${card.name} to ${bfName(s, options.battlefield!)}${accelerate ? ' (accelerated)' : ''}.`, card)
    } else {
      p.base.push(unit)
      log(s, side, 'play', `${who(side)} played ${card.name}${accelerate ? ' (accelerated, ready)' : ''}.`, card)
    }
    for (const a of script.abilities.filter((x) => x.trigger === 'play')) {
      const here = whereIs(s, unit.uid)
      runEffects(s, side, a.effects, choose, typeof here === 'number' ? here : null, unit.uid)
    }
    if (!script.full && !s.manual.includes(side)) log(s, side, 'spell', `${card.name} has text the game doesn't run: apply it with the tools if it matters.`, card)
  } else if (isGear(card)) {
    p.gear.push({ uid: uid(s), card, exhausted: false })
    log(s, side, 'play', `${who(side)} played ${card.name}.`, card)
    for (const a of script.abilities.filter((x) => x.trigger === 'play')) runEffects(s, side, a.effects, choose, null)
    if (!script.full && !s.manual.includes(side)) log(s, side, 'spell', `${card.name} has text the game doesn't run: apply it with the tools if it matters.`, card)
  } else {
    p.trash.push(card)
    const here = s.showdown?.battlefield ?? null
    if (script.full) {
      log(s, side, 'play', `${who(side)} cast ${card.name}.`, card)
      runEffects(s, side, script.spell, choose, here)
    } else {
      log(s, side, 'spell', `${who(side)} cast ${card.name}: resolve it with the tools.`, card)
    }
    // In a showdown, casting passes the focus on and starts the passing over.
    if (s.showdown) {
      s.showdown.focus = other(side)
      s.showdown.passes = 0
    }
  }
  checkWin(s)
  return s
}

// ---------- moving, showdowns, combat, scoring ----------

/** Whether `units` (all `side`'s, all ready) can make a standard move to `to`. */
export function canMove(state: GameState, side: Side, unitUids: string[], to: 'base' | number): boolean {
  if (state.phase !== 'main' || state.showdown || state.active !== side || !unitUids.length) return false
  // By hand, any of your units goes anywhere: the rules are yours to keep.
  const manual = state.manual.includes(side)
  return unitUids.every((id) => {
    const unit = allUnits(state).find((u) => u.uid === id)
    const from = whereIs(state, id)
    if (!unit || unit.owner !== side || from == null || from === to) return false
    if (manual) return true
    if (unit.exhausted) return false
    // Battlefield to battlefield needs Ganking.
    return from === 'base' || to === 'base' || unit.keywords.ganking
  })
}

/**
 * A standard move: the units exhaust and go to `to` together. At a battlefield with enemy units that
 * opens a showdown (or, with `instant` or nobody to answer, goes straight to combat); at one without,
 * you take control and conquer it.
 */
export function move(state: GameState, side: Side, unitUids: string[], to: 'base' | number, instant = false): GameState {
  if (!canMove(state, side, unitUids, to)) return state
  const s = clone(state)
  const moving = unitUids.map((id) => takeUnit(s, id)!).filter(Boolean)
  for (const u of moving) u.exhausted = true
  const names = moving.map((u) => u.card.name).join(', ')
  if (s.manual.includes(side)) {
    // By hand: the units just go there. Fights, conquering and scoring are yours.
    if (to === 'base') s.players[side].base.push(...moving)
    else s.battlefields[to].units.push(...moving)
    log(s, side, 'move', `${who(side)} moved ${names} to ${to === 'base' ? 'base' : bfName(s, to)}.`)
    return s
  }
  if (to === 'base') {
    s.players[side].base.push(...moving)
    log(s, side, 'move', `${who(side)} moved ${names} to base.`)
    for (const u of moving) trigger(s, u, 'move')
    return s
  }
  const bf = s.battlefields[to]
  bf.units.push(...moving)
  log(s, side, 'move', `${who(side)} moved ${names} to ${bfName(s, to)}.`)
  for (const u of moving) trigger(s, u, 'move')
  if (bf.units.some((u) => u.owner !== side)) {
    for (const u of bf.units.filter((x) => x.owner === side)) trigger(s, u, 'attack')
    for (const u of bf.units.filter((x) => x.owner !== side)) trigger(s, u, 'defend')
    for (const u of allUnits(s).filter(lethal)) kill(s, u.uid, 'damage')
    if (!bf.units.some((u) => u.owner === side)) {
      // The attackers died before combat.
    } else if (!bf.units.some((u) => u.owner !== side)) takeControl(s, to, side)
    else if (instant || s.players[other(side)].empty) combat(s, to, side)
    else {
      s.showdown = { battlefield: to, attacker: side, focus: other(side), passes: 0 }
      log(s, side, 'combat', `Showdown at ${bfName(s, to)}: ${other(side) === 0 ? 'you' : 'your opponent'} may cast an Action or Reaction, or pass.`)
    }
  } else if (bf.controller !== side) takeControl(s, to, side)
  checkWin(s)
  return s
}

/** Passes in a showdown: the focus moves on; after two passes in a row, combat happens. */
export function pass(state: GameState, side: Side): GameState {
  if (!state.showdown || state.showdown.focus !== side) return state
  const s = clone(state)
  const sd = s.showdown!
  sd.passes += 1
  sd.focus = other(side)
  if (sd.passes >= 2) {
    s.showdown = null
    const bf = s.battlefields[sd.battlefield]
    for (const u of allUnits(s).filter(lethal)) kill(s, u.uid, 'damage')
    const attackers = bf.units.some((u) => u.owner === sd.attacker)
    const defenders = bf.units.some((u) => u.owner !== sd.attacker)
    if (attackers && defenders) combat(s, sd.battlefield, sd.attacker)
    else if (attackers) takeControl(s, sd.battlefield, sd.attacker)
  }
  checkWin(s)
  return s
}

function takeControl(s: GameState, index: number, side: Side) {
  const bf = s.battlefields[index]
  bf.controller = side
  const p = s.players[side]
  if (bf.scored.includes(side)) {
    log(s, side, 'score', `${who(side)} took ${bfName(s, index)} (already scored this turn).`)
    return
  }
  bf.scored.push(side)
  // The last point by conquering needs every battlefield scored this turn; otherwise it's a card instead.
  const lastPoint = p.points + 1 >= VICTORY_SCORE
  if (lastPoint && !s.battlefields.every((b) => b.scored.includes(side))) {
    draw(s, side)
    log(s, side, 'score', `${who(side)} conquered ${bfName(s, index)}, but the last point needs every battlefield scored this turn: drew a card instead.`)
  } else {
    p.points += 1
    log(s, side, 'score', `${who(side)} conquered ${bfName(s, index)}: +1 (${p.points}).`)
  }
  for (const u of bf.units.filter((x) => x.owner === side)) trigger(s, u, 'conquer')
}

/**
 * Deals one side's total Might to the other side's units: each takes lethal damage in full before
 * the next, Tank units first and Backline units last, the rest weakest first so the most die.
 */
function assignDamage(total: number, targets: Unit[], defending: boolean) {
  const order = [...targets].sort((a, b) => {
    const rank = (u: Unit) => (u.keywords.tank ? 0 : u.keywords.backline ? 2 : 1)
    const left = (u: Unit) => combatMight(u, !defending) - u.damage
    return rank(a) - rank(b) || left(a) - left(b)
  })
  let remaining = total
  for (const u of order) {
    if (remaining <= 0) break
    const need = Math.max(1, combatMight(u, !defending) - u.damage)
    const dealt = Math.min(need, remaining)
    u.damage += dealt
    remaining -= dealt
  }
}

function combat(s: GameState, index: number, attacker: Side) {
  const bf = s.battlefields[index]
  const attackers = bf.units.filter((u) => u.owner === attacker)
  const defenders = bf.units.filter((u) => u.owner !== attacker)
  const attackMight = attackers.filter((u) => !u.stunned).reduce((n, u) => n + combatMight(u, true), 0)
  const defendMight = defenders.filter((u) => !u.stunned).reduce((n, u) => n + combatMight(u, false), 0)
  assignDamage(attackMight, defenders, true)
  assignDamage(defendMight, attackers, false)
  const dead = bf.units.filter((u) => u.damage >= combatMight(u, u.owner === attacker))
  log(
    s,
    attacker,
    'combat',
    `Combat at ${bfName(s, index)}: ${attacker === 0 ? 'your' : 'their'} ${attackMight} Might against ${defendMight}.` + (dead.length ? ` ${dead.map((u) => u.card.name).join(', ')} died.` : ' Nothing died.'),
  )
  for (const u of dead) kill(s, u.uid)
  const attackersLeft = bf.units.filter((u) => u.owner === attacker)
  const defendersLeft = bf.units.filter((u) => u.owner !== attacker)
  if (attackersLeft.length && defendersLeft.length) {
    // Both still there: the attackers go back to base.
    bf.units = defendersLeft
    s.players[attacker].base.push(...attackersLeft)
    log(s, attacker, 'combat', `${attacker === 0 ? 'Your' : 'Their'} survivors went back to base.`)
  } else if (attackersLeft.length) {
    takeControl(s, index, attacker)
  } else if (defendersLeft.length) {
    bf.controller = other(attacker)
  }
  // Damage heals after combat.
  for (const u of allUnits(s)) u.damage = 0
}

// ---------- the tools: what card text does, applied by hand ----------

export type Tool =
  | { kind: 'damage'; unit: string; amount: number }
  | { kind: 'buff'; unit: string; amount: number }
  | { kind: 'kill'; unit: string }
  | { kind: 'ready'; unit: string }
  | { kind: 'exhaust'; unit: string }
  | { kind: 'stun'; unit: string }
  | { kind: 'toHand'; unit: string }
  | { kind: 'points'; side: Side; amount: number }
  | { kind: 'draw'; side: Side }
  | { kind: 'discard'; side: Side; handIndex: number }
  | { kind: 'channel'; side: Side }
  | { kind: 'readyRune'; side: Side }
  | { kind: 'control'; battlefield: number; side: Side | null }
  | { kind: 'recall'; unit: string }
  /** The card `index` from the top of the deck: to hand, the bottom, or the trash. */
  | { kind: 'fromDeck'; side: Side; index: number; to: 'hand' | 'bottom' | 'trash' }
  | { kind: 'shuffle'; side: Side }
  /** A card from the trash: back to hand, or to the bottom of the deck. */
  | { kind: 'fromTrash'; side: Side; index: number; to: 'hand' | 'bottom' }
  | { kind: 'token'; side: Side; might: number; name: string; battlefield: number | null; ready: boolean }
  | { kind: 'legend'; side: Side }
  | { kind: 'gear'; side: Side; gear: string }
  /** A card from hand face down at a battlefield ([Hidden]), and back again. */
  | { kind: 'hide'; side: Side; handIndex: number; battlefield: number }
  | { kind: 'unhide'; battlefield: number; hidden: string }
  | { kind: 'readyAll'; side: Side }

/** Applies a card effect by hand. Damage that reaches a unit's Might kills it. */
export function applyTool(state: GameState, tool: Tool): GameState {
  const s = clone(state)
  const find = (id: string) => allUnits(s).find((u) => u.uid === id)
  switch (tool.kind) {
    case 'damage': {
      const u = find(tool.unit)
      if (!u) return state
      u.damage = Math.max(0, u.damage + tool.amount)
      log(s, u.owner, 'tool', `${u.card.name}: ${tool.amount > 0 ? `${tool.amount} damage` : `healed ${-tool.amount}`}.`)
      if (lethal(u) && !s.showdown) kill(s, u.uid, 'damage')
      break
    }
    case 'buff': {
      const u = find(tool.unit)
      if (!u) return state
      u.bonus += tool.amount
      log(s, u.owner, 'tool', `${u.card.name}: ${tool.amount > 0 ? '+' : ''}${tool.amount} Might (${mightNow(u)}).`)
      if (mightNow(u) <= 0 || lethal(u)) kill(s, u.uid, 'no Might left')
      break
    }
    case 'kill':
      kill(s, tool.unit, 'killed')
      break
    case 'ready':
    case 'exhaust': {
      const u = find(tool.unit)
      if (!u) return state
      u.exhausted = tool.kind === 'exhaust'
      break
    }
    case 'stun': {
      const u = find(tool.unit)
      if (!u) return state
      u.stunned = true
      log(s, u.owner, 'tool', `${u.card.name} is stunned: it deals no combat damage this turn.`)
      break
    }
    case 'toHand': {
      const u = takeUnit(s, tool.unit)
      if (!u) return state
      if (!u.token) s.players[u.owner].hand.push(u.card)
      log(s, u.owner, 'tool', `${u.card.name} returned to hand.`)
      break
    }
    case 'points':
      s.players[tool.side].points = Math.max(0, s.players[tool.side].points + tool.amount)
      log(s, tool.side, 'tool', `${tool.amount > 0 ? '+' : ''}${tool.amount} point (${s.players[tool.side].points}).`)
      checkWin(s)
      break
    case 'draw':
      draw(s, tool.side)
      log(s, tool.side, 'tool', 'Drew a card.')
      break
    case 'discard': {
      const p = s.players[tool.side]
      const [card] = p.hand.splice(tool.handIndex, 1)
      if (!card) return state
      p.trash.push(card)
      log(s, tool.side, 'tool', `Discarded ${card.name}.`)
      break
    }
    case 'channel': {
      const p = s.players[tool.side]
      if (!p.runeDeck.length) return state
      p.runes.push({ uid: uid(s), domain: p.runeDeck.shift()!, exhausted: true })
      log(s, tool.side, 'tool', 'Channelled a rune (exhausted).')
      break
    }
    case 'readyRune': {
      const rune = s.players[tool.side].runes.find((r) => r.exhausted)
      if (!rune) return state
      rune.exhausted = false
      break
    }
    case 'recall': {
      const u = takeUnit(s, tool.unit)
      if (!u) return state
      s.players[u.owner].base.push(u)
      log(s, u.owner, 'tool', `${u.card.name} went back to base.`)
      break
    }
    case 'fromDeck': {
      const p = s.players[tool.side]
      const [card] = p.deck.splice(tool.index, 1)
      if (!card) return state
      if (tool.to === 'hand') p.hand.push(card)
      else if (tool.to === 'bottom') p.deck.push(card)
      else p.trash.push(card)
      log(s, tool.side, 'tool', tool.to === 'hand' ? `${who(tool.side)} took a card from the deck into hand.` : tool.to === 'bottom' ? 'Put a card on the bottom of the deck.' : `${card.name} went from the deck to the trash.`)
      break
    }
    case 'shuffle': {
      const p = s.players[tool.side]
      p.deck = shuffled(p.deck, Math.random)
      log(s, tool.side, 'tool', 'Shuffled the deck.')
      break
    }
    case 'fromTrash': {
      const p = s.players[tool.side]
      const [card] = p.trash.splice(tool.index, 1)
      if (!card) return state
      if (tool.to === 'hand') p.hand.push(card)
      else p.deck.push(card)
      log(s, tool.side, 'tool', `${card.name} went from the trash to ${tool.to === 'hand' ? 'hand' : 'the bottom of the deck'}.`)
      break
    }
    case 'token': {
      const name = tool.name.trim() || 'Token'
      const card: Card = {
        id: `riftbound:token-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        gameId: 'riftbound',
        sourceId: 'token',
        name: `${name} token`,
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
        cost: '0',
        might: Math.max(0, tool.might),
        text: null,
        legality: null,
      }
      const unit = newUnit(s, card, tool.side, !tool.ready, true)
      if (tool.battlefield != null) s.battlefields[tool.battlefield].units.push(unit)
      else s.players[tool.side].base.push(unit)
      log(s, tool.side, 'tool', `${who(tool.side)} made a ${unit.might} Might ${card.name}.`)
      break
    }
    case 'legend': {
      const p = s.players[tool.side]
      p.legendExhausted = !p.legendExhausted
      log(s, tool.side, 'tool', `${p.legend?.name ?? 'Legend'} ${p.legendExhausted ? 'exhausted for its ability' : 'readied'}.`)
      break
    }
    case 'gear': {
      const g = s.players[tool.side].gear.find((x) => x.uid === tool.gear)
      if (!g) return state
      g.exhausted = !g.exhausted
      log(s, tool.side, 'tool', `${g.card.name} ${g.exhausted ? 'exhausted' : 'readied'}.`)
      break
    }
    case 'hide': {
      const p = s.players[tool.side]
      const [card] = p.hand.splice(tool.handIndex, 1)
      if (!card) return state
      s.battlefields[tool.battlefield].hidden.push({ uid: uid(s), owner: tool.side, card })
      log(s, tool.side, 'tool', `${who(tool.side)} hid a card face down at ${bfName(s, tool.battlefield)}.`)
      break
    }
    case 'unhide': {
      const bf = s.battlefields[tool.battlefield]
      const h = bf.hidden.find((x) => x.uid === tool.hidden)
      if (!h) return state
      bf.hidden = bf.hidden.filter((x) => x.uid !== tool.hidden)
      s.players[h.owner].hand.push(h.card)
      log(s, h.owner, 'tool', `${who(h.owner)} revealed ${h.card.name} from ${bfName(s, tool.battlefield)} (back to hand to play it).`)
      break
    }
    case 'readyAll': {
      const p = s.players[tool.side]
      for (const u of allUnits(s, tool.side)) u.exhausted = false
      for (const r of p.runes) r.exhausted = false
      for (const g of p.gear) g.exhausted = false
      log(s, tool.side, 'tool', 'Readied everything.')
      break
    }
    case 'control': {
      s.battlefields[tool.battlefield].controller = tool.side
      log(s, tool.side ?? 0, 'tool', `${bfName(s, tool.battlefield)} is now ${tool.side == null ? 'nobody' : tool.side === 0 ? 'yours' : 'theirs'}.`)
      break
    }
  }
  return s
}

/** Ready runes and every rune, for showing "4 / 6". */
export function runeCount(state: GameState, side: Side): { ready: number; total: number } {
  const runes = state.players[side].runes
  return { ready: runes.filter((r) => !r.exhausted).length, total: runes.length }
}
