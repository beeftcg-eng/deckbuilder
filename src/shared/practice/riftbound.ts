import type { Card } from '../types'
import { describeEffect, needsChoice, scriptOf, sentences, type Activated, type Effect, type Target, type Trigger, type TurnKeyword } from './riftboundEffects'

/**
 * A Riftbound practice game: the board, turns, paying with runes, moving, showdowns, combat and
 * scoring, from the Core Rules (Duel: 2 battlefields, 8 points to win). Card text it can read
 * (riftboundEffects.ts) runs by itself: spells' effects, and units' "When you play me / When I attack,
 * defend, conquer, hold, move" and Deathknell abilities. Anything else is logged with its text for
 * you to apply with the manual tools (damage, Might, kill, points...). Keywords it runs: Accelerate,
 * Assault, Shield, Tank, Backline, Ganking, Temporary.
 *
 * Playing a card puts it on the chain: the other player gets priority and may answer with a
 * [Reaction] (which goes on top) or pass, and a pass resolves the top card (its targets are picked
 * when it's played, and checked again as it resolves). Moving into enemy units opens a showdown:
 * the player with the focus (the attacker first) may play an [Action] or [Reaction] or pass; when a
 * chain they started is done, the focus goes to the other player; two passes in a row and combat
 * happens.
 *
 * Every action takes a state and returns a new one (the old one is untouched), so the board keeps a
 * history for Undo and the bot can try moves out. `random` is injectable so tests are repeatable.
 *
 * Left out, on purpose: countering (the tools can return a card), Hidden (played face up),
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
  /** [Hunt N]: N XP when it conquers or holds. */
  hunt?: number
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
  /** Gear attached to it ([Equip]); recalled to its owner's base when it leaves the board. */
  equipment?: { uid: string; card: Card }[]
  /** Keywords given this turn ([Assault 2] this turn...): added to its own until the turn ends. */
  turn?: Partial<Record<TurnKeyword, number>>
  /** What its owner's Level gives it now (kept up to date by refreshLevels). */
  lvl?: { might: number; keywords: Partial<Record<TurnKeyword, number>> }
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
  /** Gear on the board, with whether it's exhausted: in base, or at battlefield `at` ([Deploy]). */
  gear: { uid: string; card: Card; exhausted: boolean; at?: number; token?: boolean }[]
  runeDeck: string[]
  runes: Rune[]
  points: number
  /** XP (Unleashed): gained by Hunt and card text, spent by abilities; [Level N] is on while you have N. */
  xp?: number
  legend: Card | null
  legendExhausted: boolean
  /** The Chosen Champion while it waits in the Champion Zone (null once played). */
  champion: Card | null
  /** Whether the deck had a Chosen Champion at all (false: the Champion Zone says so rather than "played"). */
  hadChampion?: boolean
  /** True for a side with nobody playing it (goldfishing): it never takes turns. */
  empty: boolean
  /** Online, between the games of a match: the battlefield this player picked for the next one. */
  bfPick?: string
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

/** A card played and waiting on the chain for the other player's answer. */
export interface ChainItem {
  uid: string
  side: Side
  card: Card
  /** Units picked for the effects the game runs, in order (null: skipped). */
  targets: (string | null)[]
  /** Units pointed at for text the game doesn't run (it's yours to apply when it resolves). */
  marked: string[]
  accelerate: boolean
  /** A unit played to this battlefield (if you still control it when it resolves). */
  battlefield: number | null
  /** "Choose one —": which one. */
  mode?: number
  /** An activated ability of `card` (its index in scriptOf(card).activated) instead of the card itself. */
  ability?: number
  /** The unit using the ability, when it's a unit's. */
  source?: string
  /** A triggered ability ("When you play me", a Legend's "When you play a unit"): what it does. */
  effects?: Effect[]
}

/** Cards played and not resolved yet, newest last. Whoever has priority answers the newest. */
export interface Chain {
  items: ChainItem[]
  /** Who may answer: always the other player from the newest card's. */
  priority: Side
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
  /** Cards waiting to resolve (missing or null: none, an open state). */
  chain?: Chain | null
  /** By hand: a showdown just ended, its fight not fought yet (the board offers to resolve it). */
  fight?: { battlefield: number; attacker: Side } | null
  /**
   * Sides playing by hand, like at a table: their turn steps (ready, channel, draw), moves (no
   * combat or conquering) and scoring are theirs to do; card text the game can read still runs. The game still keeps the board,
   * pays costs, and runs the other side.
   */
  manual: Side[]
  /** Online, a best-of-3: games won before this one (each side's), and the battlefields each side has played. */
  series?: { bestOf: 3; wins: [number, number]; used: [string[], string[]] }
  /** Online: which game of the match this is (a rematch adds one), when the turn started, and the turn clock in seconds (0: none). */
  matchNo?: number
  turnStartedAt?: string
  clockSeconds?: number
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
  /** Up to 3; one is picked at random for the game, unless `chosen` says which. */
  battlefields: Card[]
  /** The battlefield picked for this game (one of `battlefields`). */
  chosen?: Card | null
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
  // Only a sentence's leading tags are the card's own: not ones in reminder text, in what it gives
  // others ("give a unit [Assault 2]"), or behind a Level ("[Level 3][>] I have [Ganking]").
  const own: string[] = []
  for (const sentence of sentences(card.text ?? '')) {
    for (const tag of /^(?:\[[^\]]+\]\s*)+/.exec(sentence)?.[0].match(/\[[^\]]+\]/g) ?? []) {
      if (/^\[level /i.test(tag)) break
      own.push(tag)
    }
  }
  const text = own.join(' ')
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
    ...(num('Hunt') ? { hunt: num('Hunt') } : {}),
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
export const mightNow = (u: Unit): number => Math.max(0, u.might + u.bonus + u.temp + (u.buffed ? 1 : 0) + (u.lvl?.might ?? 0))

/** A unit's keywords now: its own, plus any given this turn. */
export function kw(u: Unit): Keywords {
  if (!u.turn && !u.lvl) return u.keywords
  const k = u.keywords
  const t = u.turn ?? {}
  const l = u.lvl?.keywords ?? {}
  return {
    ...k,
    assault: k.assault + (t.assault ?? 0) + (l.assault ?? 0),
    shield: k.shield + (t.shield ?? 0) + (l.shield ?? 0),
    tank: k.tank || !!t.tank || !!l.tank,
    ganking: k.ganking || !!t.ganking || !!l.ganking,
    backline: k.backline || !!t.backline || !!l.backline,
  }
}

/**
 * Puts each unit's Level bonuses in place: its own "[Level N][>] I have ..." and its side's Legend,
 * gear and units' "Your units have ...", for as long as its owner has the XP.
 */
function refreshLevels(s: GameState) {
  for (const side of [0, 1] as Side[]) {
    const p = s.players[side]
    const xp = p.xp ?? 0
    const units = allUnits(s, side)
    const cards = [...(p.legend ? [p.legend] : []), ...p.gear.map((g) => g.card), ...units.map((u) => u.card)]
    const forAll = cards.flatMap((c) => scriptOf(c).levels.filter((l) => l.who === 'yours' && xp >= l.level))
    for (const u of units) {
      const on = [...forAll, ...scriptOf(u.card).levels.filter((l) => l.who === 'me' && xp >= l.level)]
      // "Friendly units here have [Assault]": gear at the unit's battlefield.
      const at = s.battlefields.findIndex((b) => b.units.includes(u))
      // "Other friendly units have +1 Might (here)", "Your Mechs have [Shield]": from your other units, Legend and gear.
      const givers: { card: Card; uid?: string; at?: number | 'base' }[] = [
        ...(p.legend ? [{ card: p.legend }] : []),
        ...p.gear.map((g) => ({ card: g.card })),
        ...units.map((x) => ({ card: x.card, uid: x.uid, at: s.battlefields.findIndex((b) => b.units.includes(x)) })).map((x) => ({ ...x, at: x.at < 0 ? ('base' as const) : x.at })),
      ]
      for (const g of givers) {
        for (const a of scriptOf(g.card).auras) {
          const applies =
            a.scope === 'tag'
              ? [...(u.card.subtypes ?? []), u.card.name].some((t) => t.toLowerCase().includes(a.tag!.toLowerCase()))
              : g.uid !== u.uid && g.uid != null && (a.scope === 'others' || g.at === (at < 0 ? 'base' : at))
          if (applies) on.push({ level: 0, who: 'yours', might: a.might, keywords: a.keywords })
        }
      }
      if (at >= 0) for (const g of p.gear.filter((x) => x.at === at)) if (Object.keys(scriptOf(g.card).here).length) on.push({ level: 0, who: 'yours', might: 0, keywords: scriptOf(g.card).here })
      if (!on.length) {
        delete u.lvl
        continue
      }
      const keywords: Partial<Record<TurnKeyword, number>> = {}
      for (const l of on) for (const [k, n] of Object.entries(l.keywords) as [TurnKeyword, number][]) keywords[k] = (keywords[k] ?? 0) + n
      u.lvl = { might: on.reduce((n, l) => n + l.might, 0), keywords }
    }
  }
}

/** A unit's Might in a combat: plus Assault when attacking or Shield when defending. */
export function combatMight(u: Unit, attacking: boolean): number {
  return mightNow(u) + (attacking ? kw(u).assault : kw(u).shield)
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
  const unit = (u: Unit): Unit => ({ ...u, keywords: u.keywords, ...(u.equipment ? { equipment: [...u.equipment] } : {}), ...(u.turn ? { turn: { ...u.turn } } : {}) })
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
    chain: state.chain ? { ...state.chain, items: [...state.chain.items] } : null,
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
export function newGame(you: DeckSetup, opponent: DeckSetup | null, options: { first?: Side; random?: () => number; manual?: boolean | 'both' } = {}): GameState {
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
    p.hadChampion = !!setup.champion
    p.hand = p.deck.splice(0, 4)
  })
  const picks = [you, opponent].map((d) => (d ? shuffled(d.battlefields, random) : []))
  // A battlefield picked for the game goes first (alone, the other one is still random).
  ;[you, opponent].forEach((d, i) => {
    const at = d?.chosen ? picks[i].indexOf(d.chosen) : -1
    if (at >= 0) picks[i].unshift(...picks[i].splice(at, 1))
  })
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
    manual: options.manual === 'both' ? [0, 1] : options.manual ? [0] : [],
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

/** Starts the first turn once both players have kept (for a game put back together from two moves). */
export function beginIfKept(state: GameState): GameState {
  if (state.phase !== 'mulligan' || state.kept.length < 2) return state
  return startTurn(clone(state))
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
  refreshLevels(s)
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
      // A fight: your biggest unit (or their biggest, when it can be anyone's), then the biggest enemy it kills, else the smallest.
      case 'pick':
        return effect.target.who === 'any' ? (strongest(theirs) ?? strongest(mine)) : (strongest(mine) ?? strongest(theirs))
      case 'duel': {
        const vs = effect.vs ?? 0
        const kills = theirs.filter((u) => mightNow(u) - u.damage <= vs)
        return strongest(kills) ?? [...theirs].sort((a, b) => mightNow(a) - mightNow(b))[0] ?? null
      }
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
  /** The unit the last effect went to: "they deal damage to each other" fights it. */
  let last: Unit | null = null
  for (const raw of effects) {
    // A duel's chooser gets to know the Might it's up against.
    const partner = raw.kind === 'duel' ? (last ?? (source ? (allUnits(s).find((u) => u.uid === source) ?? null) : null)) : null
    const effect: Effect = raw.kind === 'duel' ? { ...raw, vs: partner ? mightNow(partner) - partner.damage : 0 } : raw
    if (s.phase === 'over') return
    // "Return this to its owner's hand" on gear.
    const gear = source ? s.players[side].gear.find((g) => g.uid === source) : undefined
    if (gear && effect.kind === 'toHand' && effect.target.self) {
      s.players[side].gear = s.players[side].gear.filter((g) => g !== gear)
      if (!gear.token) s.players[side].hand.push(gear.card)
      log(s, side, 'effect', `${gear.card.name} went back to hand.`)
      continue
    }
    if (effect.kind === 'bomb') {
      const at = bombSpot(s, side)
      for (let i = 0; i < effect.count; i++) s.players[side].gear.push({ uid: uid(s), card: BOMB, exhausted: false, at, token: true })
      log(s, side, 'effect', `${effect.count} Bomb${effect.count > 1 ? 's' : ''} to ${bfName(s, at)}.`)
      continue
    }
    let targets: Unit[] = []
    if ('target' in effect) {
      const legal = legalTargets(s, side, effect.target, here, source).filter((u) => effect.kind !== 'duel' || u !== partner)
      if (effect.target.all || effect.target.self) targets = legal
      else {
        const pick = choose(effect, legal)
        if (pick && legal.some((u) => u.uid === pick.uid)) targets = [legal.find((u) => u.uid === pick.uid)!]
      }
      if (!targets.length) continue
      if (!effect.target.all) last = targets[0]
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
        if (targets.some((u) => u.owner !== side)) youTrigger(s, side, 'youStun')
        break
      case 'pick':
        break
      case 'duel': {
        if (!partner || !targets[0] || !allUnits(s).includes(partner)) break
        const them = targets[0]
        const [a, b] = [mightNow(partner), mightNow(them)]
        partner.damage += b
        them.damage += a
        log(s, side, 'effect', `${partner.card.name} and ${them.card.name} deal damage to each other (${a} and ${b}).`)
        break
      }
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
          dropEquipment(s, u)
          if (!u.token) s.players[u.owner].hand.push(u.card)
        }
        break
      case 'buff':
        for (const u of targets) u.buffed = true
        break
      case 'recall':
        for (const u of targets) {
          takeUnit(s, u.uid)
          s.players[u.owner].base.push(u)
        }
        break
      case 'keyword':
        for (const u of targets) u.turn = { ...u.turn, [effect.keyword]: (u.turn?.[effect.keyword] ?? 0) + effect.amount }
        break
      case 'counter': {
        // The newest spell still waiting below this one.
        const items = s.chain?.items ?? []
        const at = items.findLastIndex((i) => i.ability == null && isSpell(i.card))
        if (at < 0) continue
        const [gone] = items.splice(at, 1)
        s.players[gone.side].trash.push(gone.card)
        log(s, side, 'effect', `Countered ${gone.card.name}.`, gone.card)
        continue
      }
      case 'modes':
        runEffects(s, side, effect.modes[0], choose, here, source)
        continue
      case 'draw':
        if (effect.ifHandAtMost != null && s.players[side].hand.length > effect.ifHandAtMost) continue
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

/** [Hunt N]: XP for its owner when it conquers or holds. */
function hunt(s: GameState, unit: Unit) {
  const n = unit.keywords.hunt
  if (!n) return
  const p = s.players[unit.owner]
  p.xp = (p.xp ?? 0) + n
  log(s, unit.owner, 'effect', `${unit.card.name}: Hunt, +${n} XP (${p.xp}).`)
}

/**
 * "When you play a unit / a spell, conquer, hold, win a combat" on `side`'s Legend, gear and units
 * (not `except`, the unit just played). One that says "you may exhaust me to" needs the card ready,
 * and exhausts it. Playing triggers wait on the chain; the others happen at once.
 */
function youTrigger(s: GameState, side: Side, kind: Trigger, except?: string, where?: number) {
  const p = s.players[side]
  type Src = { card: Card; exhausted: () => boolean; exhaust: () => void; unit?: Unit; at?: number; gear?: string }
  const sources: Src[] = [
    ...(p.legend ? [{ card: p.legend, exhausted: () => p.legendExhausted, exhaust: () => (p.legendExhausted = true) }] : []),
    ...p.gear.map((g) => ({ card: g.card, exhausted: () => g.exhausted, exhaust: () => (g.exhausted = true), at: g.at, gear: g.uid })),
    ...allUnits(s, side)
      .filter((u) => u.uid !== except)
      .map((u) => ({ card: u.card, exhausted: () => u.exhausted, exhaust: () => (u.exhausted = true), unit: u })),
  ]
  for (const src of sources) {
    for (const a of scriptOf(src.card).abilities.filter((x) => x.trigger === kind)) {
      // "When you hold here": gear at that battlefield only.
      if (a.here && (src.at == null || src.at !== where)) continue
      if (a.exhaust) {
        if (src.exhausted()) continue
        src.exhaust()
      }
      if (kind === 'youUnit' || kind === 'youSpell') queueTrigger(s, side, src.card, a.effects, src.unit?.uid)
      else {
        log(s, side, 'effect', `${src.card.name}: triggered${a.exhaust ? ' (exhausted)' : ''}.`, src.card)
        const at = src.unit ? whereIs(s, src.unit.uid) : (src.at ?? where ?? null)
        runEffects(s, side, a.effects, bestTarget(side), typeof at === 'number' ? at : null, src.unit?.uid ?? src.gear)
      }
    }
  }
}

/**
 * A triggered ability on the chain, for the other player to answer ("When you play me", "When you
 * play a unit"). With nobody on the other side it happens at once. `targets` are picks made when the
 * card was played (yours); the rest are the owner's best.
 */
function queueTrigger(s: GameState, side: Side, card: Card, effects: Effect[], source?: string, targets?: (string | null)[], gearAt?: number | null) {
  const at = source ? whereIs(s, source) : (gearAt ?? null)
  const here = typeof at === 'number' ? at : null
  if (s.players[other(side)].empty) {
    log(s, side, 'effect', `${card.name}: triggered.`, card)
    runEffects(s, side, effects, fromPicks(side, targets), here, source)
    return
  }
  const best = bestPicks(s, side, effects, here, source)
  const given = targets ?? []
  const item: ChainItem = { uid: uid(s), side, card, targets: best.map((b, i) => (i < given.length ? given[i] : b)), marked: [], accelerate: false, battlefield: here, effects, ...(source ? { source } : {}) }
  const chain = s.chain ?? { items: [], priority: other(side) }
  chain.items.push(item)
  chain.priority = other(side)
  s.chain = chain
  log(s, side, 'effect', `${card.name}: its ability waits on the chain. ${other(side) === 0 ? 'You' : 'Opponent'} may answer with a Reaction, or pass.`, card)
}

/** A Bomb gear token. */
export const BOMB: Card = {
  id: 'riftbound:token-bomb',
  gameId: 'riftbound',
  sourceId: 'token',
  name: 'Bomb token',
  imageUrl: null,
  imageUrlSmall: null,
  orientation: 'portrait',
  setId: 'token',
  setName: 'Token',
  setCode: 'TOKEN',
  number: '0',
  rarity: null,
  category: 'Gear',
  subtypes: ['Token', 'Bomb'],
  colors: [],
  cost: '0',
  might: undefined,
  text: '[Deploy] When this dies, deal 2 to an enemy there and kill your other Bombs there.',
  legality: null,
}
const isBomb = (c: Card) => c.id === BOMB.id

/** Where `side` sends its Bombs: the battlefield with the most enemy Might, else one it doesn't hold. */
function bombSpot(s: GameState, side: Side): number {
  let best = 0
  let bestScore = -1
  s.battlefields.forEach((bf, i) => {
    const score = bf.units.filter((u) => u.owner !== side).reduce((n, u) => n + mightNow(u), 0) * 10 + (bf.controller !== side ? 1 : 0)
    if (score > bestScore) [best, bestScore] = [i, score]
  })
  return best
}

/** Gear dies: to its owner's trash (a token leaves the game). A Bomb deals 2 to an enemy there, and the owner's other Bombs there die too. */
function killGear(s: GameState, side: Side, gearUid: string, why: string) {
  const p = s.players[side]
  const g = p.gear.find((x) => x.uid === gearUid)
  if (!g) return
  p.gear = p.gear.filter((x) => x !== g)
  if (!g.token) p.trash.push(g.card)
  log(s, side, 'effect', `${g.card.name} died (${why}).`)
  if (!isBomb(g.card) || g.at == null) return
  const at = g.at
  const enemies = s.battlefields[at].units.filter((u) => u.owner !== side)
  const target = bestTarget(side)({ kind: 'damage', amount: 2, target: { who: 'enemy', where: 'here', all: false, self: false } }, enemies)
  if (target) {
    target.damage += 2
    log(s, side, 'effect', `Bomb: 2 to ${target.card.name}.`)
    if (lethal(target) && !s.showdown) kill(s, target.uid, 'damage')
  }
  for (const other of p.gear.filter((x) => x.at === at && isBomb(x.card))) killGear(s, side, other.uid, 'another Bomb went off')
}

/** A unit leaving the board leaves its equipment behind, recalled to its owner's base. */
function dropEquipment(s: GameState, unit: Unit) {
  for (const e of unit.equipment ?? []) s.players[unit.owner].gear.push({ uid: e.uid, card: e.card, exhausted: false })
  unit.equipment = []
}

function kill(s: GameState, unitUid: string, why?: string) {
  const unit = takeUnit(s, unitUid)
  if (!unit) return
  dropEquipment(s, unit)
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
    log(s, side, 'info', 'Ready your cards, score what you hold, channel your runes and draw (Start of turn does all of it for you).')
    return s
  }
  // Awaken: ready everything.
  for (const u of allUnits(s, side)) u.exhausted = false
  for (const r of p.runes) r.exhausted = false
  for (const g of p.gear) g.exhausted = false
  p.legendExhausted = false
  // Beginning: Temporary units die, "at start of your Beginning Phase", then hold every battlefield you control.
  for (const u of allUnits(s, side).filter((x) => x.keywords.temporary)) kill(s, u.uid, 'Temporary')
  youTrigger(s, side, 'youBegin')
  holdAll(s, side)
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
  youTrigger(s, side, 'youBegin')
  holdAll(s, side)
  if ((s.phase as GameState['phase']) === 'over') return s
  const channel = s.turn === 1 && side !== s.first ? 3 : 2
  for (let i = 0; i < channel && p.runeDeck.length; i++) p.runes.push({ uid: uid(s), domain: p.runeDeck.shift()!, exhausted: false })
  draw(s, side)
  log(s, side, 'info', `${who(side)} readied, channelled ${channel} and drew 1.`)
  return s
}

/** The Beginning Phase's hold: +1 for each battlefield `side` controls and hasn't scored this turn, with Hunt and "when you hold". */
function holdAll(s: GameState, side: Side) {
  const p = s.players[side]
  s.battlefields.forEach((bf, i) => {
    if (bf.controller === side && !bf.scored.includes(side)) {
      // [Deploy]: an opponent's gear here dies when you hold it.
      const foe = s.players[other(side)]
      for (const g of foe.gear.filter((x) => x.at === i)) killGear(s, other(side), g.uid, `${who(side) === 'You' ? 'you' : 'the opponent'} held ${bfName(s, i)}`)
      bf.scored.push(side)
      p.points += 1
      log(s, side, 'score', `${who(side)} held ${bfName(s, i)}: +1 (${p.points}).`)
      for (const u of bf.units.filter((x) => x.owner === side)) {
        trigger(s, u, 'hold')
        hunt(s, u)
      }
      youTrigger(s, side, 'youHold', undefined, i)
    }
  })
  checkWin(s)
}

/** Ends the active player's turn: units heal, "this turn" ends, and the other player's turn starts (unless nobody's there). */
export function endTurn(state: GameState): GameState {
  if (state.phase !== 'main' || state.showdown || state.chain?.items.length) return state
  const s = clone(state)
  for (const u of allUnits(s)) {
    u.damage = 0
    u.stunned = false
    u.temp = 0
    delete u.turn
  }
  for (const bf of s.battlefields) bf.scored = []
  s.fight = null
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
  /** Units pointed at for the text the game doesn't run (shown on the chain, for you to apply). */
  marked?: string[]
  /** "Choose one —": which one. */
  mode?: number
}

/**
 * Whether `side` may play unit `card` to battlefield `index`: one it controls, any one by hand, or an
 * open one (nobody's, empty) when the card or something of `side`'s allows it ("You may play me to an
 * open battlefield", "Friendly units may be played to open battlefields").
 */
export function canPlayTo(s: GameState, side: Side, card: Card, index: number): boolean {
  const bf = s.battlefields[index]
  if (!bf) return false
  if (bf.controller === side || s.manual.includes(side)) return true
  if (bf.controller != null || bf.units.length) return false
  const p = s.players[side]
  return scriptOf(card).openPlay != null || [...(p.legend ? [p.legend] : []), ...p.gear.map((g) => g.card), ...allUnits(s, side).map((u) => u.card)].some((c) => scriptOf(c).openPlay === 'friendly')
}

/** The cost of a card as played: Energy and Power, with Accelerate's extra when asked for. */
export function costOf(card: Card, accelerate = false): { energy: number; power: number } {
  return { energy: energyCost(card) + (accelerate ? 1 : 0), power: powerCost(card) + (accelerate ? 1 : 0) }
}

/**
 * Whether `side` may play `card` now: a Reaction when it has priority on the chain; an Action or
 * Reaction in a showdown with the focus; anything on its own turn otherwise.
 */
export function canPlay(state: GameState, side: Side, card: Card, accelerate = false): boolean {
  if (state.phase !== 'main') return false
  if (state.chain?.items.length) {
    if (state.chain.priority !== side || scriptOf(card).timing !== 'reaction') return false
  } else if (state.showdown) {
    if (state.showdown.focus !== side || !scriptOf(card).timing) return false
  } else if (state.active !== side) return false
  if (accelerate && !keywordsOf(card).accelerate) return false
  const { energy, power } = costOf(card, accelerate)
  return canPay(state, side, energy, power, card.colors)
}

/** A card's "Choose one —" choices (empty when it has none). */
export function modesOf(card: Card): Effect[][] {
  const m = scriptOf(card).prefix.find((e) => e.kind === 'modes')
  return m && m.kind === 'modes' ? m.modes : []
}

/** What a card does as it resolves: a spell's effects (what's read of them), with its mode picked; a unit's or gear's "When you play me". */
export function effectsOf(card: Card, mode = 0): Effect[] {
  const script = scriptOf(card)
  const effects = isSpell(card) ? script.prefix : script.abilities.filter((a) => a.trigger === 'play').flatMap((a) => a.effects)
  return effects.flatMap((e) => (e.kind === 'modes' ? (e.modes[mode] ?? e.modes[0]) : [e]))
}

/** The effects of a card that need a unit picked when it's played: a spell's (what's read of it), or a unit's "When you play me". */
export function playChoices(card: Card, mode = 0): Effect[] {
  return effectsOf(card, mode).filter(needsChoice)
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

/** The units the best picks would go to now, for `side` playing `card` (the bot's targets, and anyone's not given). */
function bestPicks(s: GameState, side: Side, effects: Effect[], here: number | null, source?: string): (string | null)[] {
  const best = bestTarget(side)
  return effects.filter(needsChoice).map((e) => ('target' in e ? (best(e, legalTargets(s, side, e.target, here, source))?.uid ?? null) : null))
}

/**
 * Plays the card at `handIndex` (or the Champion from its zone, with -1): pays for it and puts it on
 * the chain, where the other player may answer it (see pass). With nobody on the other side, or
 * played for free by an effect, it resolves at once.
 */
export function play(state: GameState, side: Side, handIndex: number, options: PlayOptions = {}): GameState {
  const p0 = state.players[side]
  const card = handIndex === -1 ? p0.champion : p0.hand[handIndex]
  if (!card || state.phase !== 'main') return state
  if (!options.free && !canPlay(state, side, card, options.accelerate)) return state
  // [Deploy] gear goes only to a battlefield (any one); other gear only to base.
  const deploy = isGear(card) && scriptOf(card).deploy
  if (deploy && (options.battlefield == null || !state.battlefields[options.battlefield])) return state
  if (isGear(card) && !deploy && options.battlefield != null) return state
  const accelerate = !!options.accelerate && keywordsOf(card).accelerate && isUnit(card)
  const s = clone(state)
  const p = s.players[side]
  if (!options.free) {
    const { energy, power } = costOf(card, accelerate)
    if (!pay(s, side, energy, power, card.colors)) return state
  }
  if (handIndex === -1) p.champion = null
  else p.hand.splice(handIndex, 1)
  const here = isUnit(card) || deploy ? (options.battlefield ?? null) : (s.showdown?.battlefield ?? null)
  const given = options.targets ?? []
  const best = bestPicks(s, side, effectsOf(card, options.mode), here)
  const item: ChainItem = {
    uid: uid(s),
    side,
    card,
    targets: best.map((b, i) => (i < given.length ? given[i] : b)),
    marked: options.marked ?? [],
    accelerate,
    battlefield: options.battlefield ?? null,
    ...(options.mode ? { mode: options.mode } : {}),
  }
  // "When you play a unit / a spell" triggers as it's played: on the chain above it.
  const playing = isUnit(card) ? 'youUnit' : isSpell(card) ? 'youSpell' : null
  if (options.free || s.players[other(side)].empty) {
    resolveItem(s, item)
    if (playing) youTrigger(s, side, playing)
    checkWin(s)
    return s
  }
  const chain = s.chain ?? { items: [], priority: other(side) }
  chain.items.push(item)
  chain.priority = other(side)
  s.chain = chain
  const at = (ids: (string | null)[]) => ids.map((id) => allUnits(s).find((u) => u.uid === id)?.card.name).filter(Boolean).join(', ')
  const aimed = at([...item.targets, ...item.marked])
  log(s, side, 'play', `${who(side)} played ${card.name}${aimed ? ` targeting ${aimed}` : ''}. ${other(side) === 0 ? 'You' : 'Opponent'} may answer with a Reaction, or pass.`, card)
  if (playing) youTrigger(s, side, playing)
  return s
}

// ---------- activated abilities ----------

/** What has an ability to use: your Legend ('legend'), or a gear's or unit's uid. */
export function abilitySource(state: GameState, side: Side, source: string): { card: Card; exhausted: boolean; unit?: Unit } | null {
  const p = state.players[side]
  if (source === 'legend') return p.legend ? { card: p.legend, exhausted: p.legendExhausted } : null
  const gear = p.gear.find((g) => g.uid === source)
  if (gear) return { card: gear.card, exhausted: gear.exhausted }
  const unit = allUnits(state, side).find((u) => u.uid === source)
  return unit ? { card: unit.card, exhausted: unit.exhausted, unit } : null
}

/** A card's abilities used by exhausting it. */
export const abilitiesOf = (card: Card): Activated[] => scriptOf(card).activated

/** Whether `side` may use ability `index` of `source` now: it's ready, the timing allows it, and the cost can be paid. */
export function canActivate(state: GameState, side: Side, source: string, index: number): boolean {
  if (state.phase !== 'main') return false
  const src = abilitySource(state, side, source)
  const ability = src ? abilitiesOf(src.card)[index] : undefined
  if (!src || !ability || src.exhausted) return false
  if (state.chain?.items.length) {
    if (state.chain.priority !== side || ability.timing !== 'reaction') return false
  } else if (state.showdown) {
    if (state.showdown.focus !== side || !ability.timing) return false
  } else if (state.active !== side) return false
  return canPay(state, side, ability.energy, ability.power, ability.domains)
}

/**
 * Uses an ability: pays (any other cost, like "Kill this", is noted for you to do), exhausts the
 * card, and puts the ability on the chain. [Add] abilities can't be answered: they resolve at once.
 */
export function activate(state: GameState, side: Side, source: string, index: number, options: { targets?: (string | null)[]; marked?: string[] } = {}): GameState {
  if (!canActivate(state, side, source, index)) return state
  const s = clone(state)
  const src = abilitySource(s, side, source)!
  const ability = abilitiesOf(src.card)[index]
  if (!pay(s, side, ability.energy, ability.power, ability.domains)) return state
  const p = s.players[side]
  if (source === 'legend') p.legendExhausted = true
  else {
    const gear = p.gear.find((g) => g.uid === source)
    if (gear) gear.exhausted = true
    else if (src.unit) src.unit.exhausted = true
  }
  const at = src.unit ? whereIs(s, src.unit.uid) : (p.gear.find((g) => g.uid === source)?.at ?? null)
  const here = typeof at === 'number' ? at : null
  const given = options.targets ?? []
  const best = ability.effects ? bestPicks(s, side, ability.effects, here, src.unit?.uid) : []
  const item: ChainItem = {
    uid: uid(s),
    side,
    card: src.card,
    targets: best.map((b, i) => (i < given.length ? given[i] : b)),
    marked: options.marked ?? [],
    accelerate: false,
    battlefield: src.unit ? null : here,
    ability: index,
    ...(src.unit ? { source: src.unit.uid } : {}),
  }
  log(s, side, 'play', `${who(side)} used ${src.card.name}: "${ability.text}"${ability.otherCost ? ` (also: ${ability.otherCost}, with the tools)` : ''}.`, src.card)
  if (ability.add || s.players[other(side)].empty) {
    resolveItem(s, item)
    checkWin(s)
    return s
  }
  const chain = s.chain ?? { items: [], priority: other(side) }
  chain.items.push(item)
  chain.priority = other(side)
  s.chain = chain
  log(s, side, 'info', `${other(side) === 0 ? 'You' : 'Opponent'} may answer with a Reaction, or pass.`)
  return s
}

/** A card off the chain: a unit or gear enters the board, a spell does what it says and goes to the trash. */
function resolveItem(s: GameState, item: ChainItem) {
  const { side, card, accelerate } = item
  const p = s.players[side]
  if (item.effects) {
    log(s, side, 'effect', `${card.name}: ability resolved.`, card)
    const at = item.source ? whereIs(s, item.source) : item.battlefield
    runEffects(s, side, item.effects, fromPicks(side, item.targets), typeof at === 'number' ? at : null, item.source)
    return
  }
  if (item.ability != null) {
    const ability = scriptOf(card).activated[item.ability]
    const marked = item.marked.map((id) => allUnits(s).find((u) => u.uid === id)?.card.name).filter(Boolean)
    if (ability?.effects) {
      log(s, side, 'effect', `${card.name}: ability resolved.`, card)
      const at = item.source ? whereIs(s, item.source) : item.battlefield
      runEffects(s, side, ability.effects, fromPicks(side, item.targets), typeof at === 'number' ? at : null, item.source)
    } else log(s, side, 'spell', `${card.name}: "${ability?.text ?? ''}" resolved: apply it with the tools.${marked.length ? ` (targeting ${marked.join(', ')})` : ''}`, card)
    return
  }
  // Played by hand too, the text the game can read runs (at the targets picked); the rest is yours.
  const script = scriptOf(card)
  const choose = fromPicks(side, item.targets)
  const marked = item.marked.map((id) => allUnits(s).find((u) => u.uid === id)?.card.name).filter(Boolean)
  const leftToYou = (what: string) => log(s, side, 'spell', `${what}${marked.length ? ` (targeting ${marked.join(', ')})` : ''}`, card)
  if (isUnit(card)) {
    const unit = newUnit(s, card, side, !accelerate && !script.entersReady)
    const bf = item.battlefield != null ? s.battlefields[item.battlefield] : null
    if (bf && canPlayTo(s, side, card, item.battlefield!)) {
      const open = bf.controller !== side
      bf.units.push(unit)
      log(s, side, 'play', `${card.name} entered ${bfName(s, item.battlefield!)}${accelerate ? ' (accelerated)' : ''}.`, card)
      // Played to an open battlefield: you conquer it (by hand, the board offers to).
      if (open && !bf.units.some((u) => u.owner !== side)) {
        if (s.manual.includes(side)) s.fight = { battlefield: item.battlefield!, attacker: side }
        else takeControl(s, item.battlefield!, side)
      }
    } else {
      p.base.push(unit)
      log(s, side, 'play', `${card.name} entered ${who(side) === 'You' ? 'your' : 'their'} base${accelerate ? ' (accelerated, ready)' : ''}.`, card)
    }
    // "When you play me" waits on the chain, at the targets picked as it was played.
    const own = script.abilities.filter((x) => x.trigger === 'play').flatMap((a) => a.effects)
    if (own.length) queueTrigger(s, side, card, own, unit.uid, item.targets)
    if (!script.full) leftToYou(`${card.name} has text the game doesn't run: apply it with the tools if it matters.`)
  } else if (isGear(card)) {
    const at = script.deploy && item.battlefield != null ? item.battlefield : undefined
    p.gear.push({ uid: uid(s), card, exhausted: script.entersExhausted, ...(at != null ? { at } : {}) })
    log(s, side, 'play', `${card.name} entered ${at != null ? bfName(s, at) : 'play'}.`, card)
    // Gear deployed where enemy units stand contests it: a showdown there (Radiance rules).
    const bf = at != null ? s.battlefields[at] : null
    if (bf && !s.showdown && !s.players[other(side)].empty && bf.controller !== side && bf.units.some((u) => u.owner !== side)) {
      openShowdown(s, at!, side)
      log(s, side, 'combat', `${card.name} contests ${bfName(s, at!)}: a showdown there.`)
    }
    const own = script.abilities.filter((x) => x.trigger === 'play').flatMap((a) => a.effects)
    if (own.length) queueTrigger(s, side, card, own, undefined, item.targets, at)
    if (!script.full) leftToYou(`${card.name} has text the game doesn't run: apply it with the tools if it matters.`)
  } else {
    p.trash.push(card)
    const here = s.showdown?.battlefield ?? null
    if (script.full) {
      log(s, side, 'spell', `${card.name} resolved.`, card)
      runEffects(s, side, effectsOf(card, item.mode), choose, here)
    } else {
      // What it could read runs; the rest is yours.
      if (script.prefix.length) runEffects(s, side, effectsOf(card, item.mode), choose, here)
      leftToYou(`${card.name} resolved${script.prefix.length ? `; the rest is yours: "${script.leftover ?? ''}"` : ': apply it with the tools.'}`)
    }
  }
}

/**
 * Resolves every card on the chain as if both players pass: what the bot uses to see where a play
 * leads.
 */
export function settle(state: GameState): GameState {
  let s = state
  for (let i = 0; i < 50 && s.chain?.items.length && s.phase === 'main'; i++) s = pass(s, s.chain.priority)
  return s
}

// ---------- moving, showdowns, combat, scoring ----------

/** Whether `units` (all `side`'s, all ready) can make a standard move to `to`. */
export function canMove(state: GameState, side: Side, unitUids: string[], to: 'base' | number): boolean {
  if (state.phase !== 'main' || state.showdown || state.chain?.items.length || state.active !== side || !unitUids.length) return false
  // By hand, any of your units goes anywhere: the rules are yours to keep.
  const manual = state.manual.includes(side)
  return unitUids.every((id) => {
    const unit = allUnits(state).find((u) => u.uid === id)
    const from = whereIs(state, id)
    if (!unit || unit.owner !== side || from == null || from === to) return false
    if (manual) return true
    if (unit.exhausted) return false
    // Battlefield to battlefield needs Ganking.
    return from === 'base' || to === 'base' || kw(unit).ganking
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
    // Into enemy units: still a showdown, for Actions and Reactions; the fight after it is yours (or
    // the game's, if you ask). Into an empty one you don't hold: the board offers to conquer it.
    const bf = to === 'base' ? null : s.battlefields[to]
    if (bf && !s.players[other(side)].empty && bf.units.some((u) => u.owner !== side)) openShowdown(s, to as number, side)
    else if (bf && bf.controller !== side) s.fight = { battlefield: to as number, attacker: side }
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
    youTrigger(s, side, 'youAttack', undefined, to)
    if (bf.controller === other(side)) youTrigger(s, other(side), 'foeAttack', undefined, to)
    for (const u of bf.units.filter((x) => x.owner !== side)) trigger(s, u, 'defend')
    for (const u of allUnits(s).filter(lethal)) kill(s, u.uid, 'damage')
    if (!bf.units.some((u) => u.owner === side)) {
      // The attackers died before combat.
    } else if (!bf.units.some((u) => u.owner !== side)) takeControl(s, to, side)
    else if (instant || s.players[other(side)].empty) combat(s, to, side)
    else {
      openShowdown(s, to, side)
    }
  } else if (bf.controller !== side) takeControl(s, to, side)
  checkWin(s)
  return s
}

/** A showdown at battlefield `index`, `attacker` having moved in: the attacker gets the focus first (Core Rules 345). */
function openShowdown(s: GameState, index: number, attacker: Side) {
  s.showdown = { battlefield: index, attacker, focus: attacker, passes: 0 }
  log(s, attacker, 'combat', `Showdown at ${bfName(s, index)}: ${attacker === 0 ? 'you' : 'your opponent'} may play an Action or Reaction, or pass.`)
}

/**
 * Passes. With cards on the chain, the player with priority lets the newest resolve; the other player
 * then gets priority on the next one down. When the chain is done, in a showdown the focus goes to
 * the player who didn't start it. In a showdown with no chain, the focus moves on; after two passes
 * in a row, combat happens.
 */
export function pass(state: GameState, side: Side): GameState {
  if (state.chain?.items.length) {
    if (state.chain.priority !== side || state.phase !== 'main') return state
    const s = clone(state)
    const chain = s.chain!
    const starter = chain.items[0].side
    const item = chain.items.pop()!
    resolveItem(s, item)
    chainMoved(s, starter)
    checkWin(s)
    return s
  }
  if (!state.showdown || state.showdown.focus !== side) return state
  const s = clone(state)
  const sd = s.showdown!
  sd.passes += 1
  sd.focus = other(side)
  if (sd.passes >= 2) {
    s.showdown = null
    // A showdown over [Deploy] gear, with no units of the player who started it there: nothing to fight.
    if (s.manual.includes(sd.attacker) && s.battlefields[sd.battlefield].units.some((u) => u.owner === sd.attacker)) {
      s.fight = { battlefield: sd.battlefield, attacker: sd.attacker }
      log(s, sd.attacker, 'combat', `The showdown at ${bfName(s, sd.battlefield)} is over: resolve the combat, or fight it out with the tools.`)
      return s
    }
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

/**
 * After a card leaves the chain: the other player from the newest one left gets priority; an empty
 * chain closes, and in a showdown the focus goes to whoever didn't start it.
 */
function chainMoved(s: GameState, starter: Side) {
  if (s.chain && s.chain.items.length) s.chain.priority = other(s.chain.items[s.chain.items.length - 1].side)
  else {
    s.chain = null
    if (s.showdown) {
      s.showdown.focus = other(starter)
      s.showdown.passes = 0
    }
  }
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
  for (const u of bf.units.filter((x) => x.owner === side)) {
    trigger(s, u, 'conquer')
    hunt(s, u)
  }
  youTrigger(s, side, 'youConquer', undefined, index)
}

/**
 * Deals one side's total Might to the other side's units: each takes lethal damage in full before
 * the next, Tank units first and Backline units last, the rest weakest first so the most die.
 */
function assignDamage(total: number, targets: Unit[], defending: boolean) {
  const order = [...targets].sort((a, b) => {
    const rank = (u: Unit) => (kw(u).tank ? 0 : kw(u).backline ? 2 : 1)
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
  // Bonuses from where everyone stands now ("Other friendly units have +1 Might here").
  refreshLevels(s)
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
    youTrigger(s, attacker, 'youWin', undefined, index)
    takeControl(s, index, attacker)
  } else if (defendersLeft.length) {
    bf.controller = other(attacker)
    youTrigger(s, other(attacker), 'youWin', undefined, index)
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
  | { kind: 'fromDeck'; side: Side; index: number; to: 'hand' | 'bottom' | 'trash' | 'top' }
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
  | { kind: 'xp'; side: Side; amount: number }
  /** One rune: exhaust or ready it, or recycle it (to the bottom of the rune deck, as paying Power does). */
  | { kind: 'rune'; side: Side; rune: string; action: 'toggle' | 'recycle' }
  /** Attach gear from base to one of your units ([Equip]), or take it off again. */
  | { kind: 'equip'; side: Side; gear: string; unit: string }
  | { kind: 'unequip'; unit: string; gear: string; to?: 'base' | 'hand' }
  /** Gear moved: back to its owner's hand, to the trash, to base, or to a battlefield. */
  | { kind: 'moveGear'; side: Side; gear: string; to: 'hand' | 'trash' | 'base' | number }
  /** A card on the chain countered: it's gone, to its owner's trash (an ability just ends). */
  | { kind: 'counter'; item: string }
  /** By hand, after a showdown: the game fights it (resolve) or you do (not). */
  | { kind: 'combat'; resolve: boolean }

/** Applies a card effect by hand. Damage that reaches a unit's Might kills it. */
export function applyTool(state: GameState, tool: Tool): GameState {
  const s = clone(state)
  const find = (id: string) => allUnits(s).find((u) => u.uid === id)
  switch (tool.kind) {
    case 'counter': {
      const items = s.chain?.items ?? []
      const at = items.findIndex((i) => i.uid === tool.item)
      if (at < 0) return state
      const starter = items[0].side
      const [gone] = items.splice(at, 1)
      if (gone.ability == null) s.players[gone.side].trash.push(gone.card)
      log(s, gone.side, 'tool', `${gone.card.name} was countered.`, gone.card)
      chainMoved(s, starter)
      break
    }
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
      dropEquipment(s, u)
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
      else if (tool.to === 'top') p.deck.unshift(card)
      else if (tool.to === 'bottom') p.deck.push(card)
      else p.trash.push(card)
      log(s, tool.side, 'tool', tool.to === 'hand' ? `${who(tool.side)} took a card from the deck into hand.` : tool.to === 'top' ? 'Put a card on top of the deck.' : tool.to === 'bottom' ? 'Put a card on the bottom of the deck.' : `${card.name} went from the deck to the trash.`)
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
    case 'xp': {
      const p = s.players[tool.side]
      p.xp = Math.max(0, (p.xp ?? 0) + tool.amount)
      log(s, tool.side, 'tool', `${tool.amount > 0 ? '+' : ''}${tool.amount} XP (${p.xp}).`)
      break
    }
    case 'rune': {
      const p = s.players[tool.side]
      const rune = p.runes.find((r) => r.uid === tool.rune)
      if (!rune) return state
      if (tool.action === 'toggle') rune.exhausted = !rune.exhausted
      else {
        p.runes = p.runes.filter((r) => r.uid !== tool.rune)
        p.runeDeck.push(rune.domain)
        log(s, tool.side, 'tool', `${who(tool.side)} recycled a ${rune.domain} rune.`)
      }
      break
    }
    case 'equip': {
      const p = s.players[tool.side]
      const g = p.gear.find((x) => x.uid === tool.gear)
      const u = find(tool.unit)
      if (!g || !u || u.owner !== tool.side) return state
      p.gear = p.gear.filter((x) => x.uid !== tool.gear)
      u.equipment = [...(u.equipment ?? []), { uid: g.uid, card: g.card }]
      log(s, tool.side, 'tool', `${g.card.name} attached to ${u.card.name}.`)
      break
    }
    case 'unequip': {
      const u = find(tool.unit)
      const e = u?.equipment?.find((x) => x.uid === tool.gear)
      if (!u || !e) return state
      u.equipment = u.equipment!.filter((x) => x.uid !== tool.gear)
      if (tool.to === 'hand') s.players[u.owner].hand.push(e.card)
      else s.players[u.owner].gear.push({ uid: e.uid, card: e.card, exhausted: false })
      log(s, u.owner, 'tool', `${e.card.name} taken off ${u.card.name}, back to ${tool.to === 'hand' ? 'hand' : 'base'}.`)
      break
    }
    case 'moveGear': {
      const p = s.players[tool.side]
      const g = p.gear.find((x) => x.uid === tool.gear)
      if (!g) return state
      if (tool.to === 'trash') killGear(s, tool.side, g.uid, 'by hand')
      else if (tool.to === 'hand') {
        p.gear = p.gear.filter((x) => x !== g)
        if (!g.token) p.hand.push(g.card)
        log(s, tool.side, 'tool', `${g.card.name} went back to hand${g.token ? ' (a token: it left the game)' : ''}.`)
      } else if (tool.to === 'base') {
        delete g.at
        log(s, tool.side, 'tool', `${g.card.name} moved to base.`)
      } else {
        if (!s.battlefields[tool.to]) return state
        g.at = tool.to
        log(s, tool.side, 'tool', `${g.card.name} moved to ${bfName(s, tool.to)}.`)
      }
      break
    }
    case 'control': {
      s.battlefields[tool.battlefield].controller = tool.side
      log(s, tool.side ?? 0, 'tool', `${bfName(s, tool.battlefield)} is now ${tool.side == null ? 'nobody' : tool.side === 0 ? 'yours' : 'theirs'}.`)
      break
    }
    case 'combat': {
      const f = s.fight
      if (!f) return state
      s.fight = null
      if (!tool.resolve) {
        log(s, f.attacker, 'tool', 'The fight is done by hand.')
        break
      }
      const bf = s.battlefields[f.battlefield]
      const attackers = bf.units.some((u) => u.owner === f.attacker)
      const defenders = bf.units.some((u) => u.owner !== f.attacker)
      if (attackers && defenders) combat(s, f.battlefield, f.attacker)
      else if (attackers) takeControl(s, f.battlefield, f.attacker)
      break
    }
  }
  checkWin(s)
  return s
}

/** Ready runes and every rune, for showing "4 / 6". */
export function runeCount(state: GameState, side: Side): { ready: number; total: number } {
  const runes = state.players[side].runes
  return { ready: runes.filter((r) => !r.exhausted).length, total: runes.length }
}
