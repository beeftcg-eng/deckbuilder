import type { Card } from '../types'

/**
 * A Riftbound practice game: the board, turns, paying with runes, moving, combat and scoring, from
 * the Core Rules (Duel: 2 battlefields, 8 points to win). It runs the game's structure, not its card
 * text: a spell goes to the trash with its text in the log, and any effect is yours to apply with the
 * manual tools (damage, buffs, kill, points...). Keywords it does run: Accelerate, Assault, Shield,
 * Tank, Backline, Ganking, Temporary.
 *
 * Every action takes a state and returns a new one (the old one is untouched), so the board keeps a
 * history for Undo. `random` is injectable so tests are repeatable.
 *
 * What it leaves out, on purpose: showdowns with spells and reactions mid-combat (resolve those
 * yourself, then let combat run), Hidden, Legion, Equip, Level and the rest of the text-driven
 * keywords, and costs that cards change.
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
  /** +Might from buffs and effects, set with the tools. */
  bonus: number
  damage: number
  exhausted: boolean
  stunned: boolean
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
}

export type LogKind = 'turn' | 'play' | 'move' | 'combat' | 'score' | 'spell' | 'tool' | 'info' | 'win'

export interface LogEntry {
  turn: number
  side: Side
  kind: LogKind
  text: string
  /** A card to show next to it (a spell's text, what was played). */
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

function clone(state: GameState): GameState {
  return structuredClone(state)
}

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
 * is goldfishing: nobody on the other side.
 */
export function newGame(you: DeckSetup, opponent: DeckSetup | null, options: { first?: Side; random?: () => number } = {}): GameState {
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
  const chosen = opponent ? [picks[0][0], picks[1][0]] : picks[0].slice(0, 2)
  while (chosen.length < 2) chosen.push(undefined as unknown as Card)
  const first: Side = opponent ? (options.first ?? (random() < 0.5 ? 0 : 1)) : 0
  const state: GameState = {
    players,
    battlefields: chosen.map((card) => ({ card: card ?? null, controller: null, units: [], scored: [] })),
    turn: 1,
    active: first,
    first,
    phase: 'mulligan',
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
  const who = side === 0 ? 'You' : 'Opponent'
  log(s, side, 'info', aside.length ? `${who} mulliganed ${aside.length}.` : `${who} kept.`)
  return s.kept.length === 2 ? startTurn(s) : s
}

// ---------- turns ----------

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

function allUnits(s: GameState, side?: Side): Unit[] {
  const units = [...s.players[0].base, ...s.players[1].base, ...s.battlefields.flatMap((b) => b.units)]
  return side == null ? units : units.filter((u) => u.owner === side)
}

function checkWin(s: GameState) {
  if (s.phase === 'over') return
  const [a, b] = [s.players[0].points, s.players[1].points]
  if (Math.max(a, b) >= VICTORY_SCORE && a !== b) {
    s.phase = 'over'
    s.winner = a > b ? 0 : 1
    log(s, s.winner, 'win', s.winner === 0 ? 'You win!' : 'Your opponent wins.')
  }
}

/** The active player's turn up to their Main Phase: Awaken, Beginning (Temporary dies, then Hold), Channel, Draw. */
function startTurn(state: GameState): GameState {
  const s = state
  s.phase = 'main'
  const side = s.active
  const p = s.players[side]
  log(s, side, 'turn', side === 0 ? `Your turn ${s.turn}` : `Opponent's turn ${s.turn}`)
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
      log(s, side, 'score', `Held ${bfName(s, i)}: +1 (${p.points}).`)
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

/** Ends the active player's turn: units heal, "this turn" ends, and the other player's turn starts (unless nobody's there). */
export function endTurn(state: GameState): GameState {
  if (state.phase !== 'main') return state
  const s = clone(state)
  for (const u of allUnits(s)) {
    u.damage = 0
    u.stunned = false
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
}

function newUnit(s: GameState, card: Card, owner: Side, exhausted: boolean): Unit {
  return { uid: uid(s), card, owner, might: mightOf(card), bonus: 0, damage: 0, exhausted, stunned: false, keywords: keywordsOf(card) }
}

/** The cost of a card as played: Energy and Power, with Accelerate's extra when asked for. */
export function costOf(card: Card, accelerate = false): { energy: number; power: number } {
  return { energy: energyCost(card) + (accelerate ? 1 : 0), power: powerCost(card) + (accelerate ? 1 : 0) }
}

/** Whether a card in hand (or the Champion, with `champion`) can be played now. */
export function canPlay(state: GameState, side: Side, card: Card, accelerate = false): boolean {
  if (state.phase !== 'main' || state.active !== side) return false
  if (accelerate && !keywordsOf(card).accelerate) return false
  const { energy, power } = costOf(card, accelerate)
  return canPay(state, side, energy, power, card.colors)
}

/**
 * Plays the card at `handIndex` (or the Champion from its zone, with -1): pays for it, then a unit or
 * gear goes to base (a unit exhausted unless Accelerated), a spell to the trash with its text logged
 * for you to resolve.
 */
export function play(state: GameState, side: Side, handIndex: number, options: PlayOptions = {}): GameState {
  if (state.phase !== 'main') return state
  const p0 = state.players[side]
  const card = handIndex === -1 ? p0.champion : p0.hand[handIndex]
  if (!card) return state
  const accelerate = !!options.accelerate && keywordsOf(card).accelerate && isUnit(card)
  const s = clone(state)
  const p = s.players[side]
  if (!options.free) {
    const { energy, power } = costOf(card, accelerate)
    if (!pay(s, side, energy, power, card.colors)) return state
  }
  if (handIndex === -1) p.champion = null
  else p.hand.splice(handIndex, 1)
  const who = side === 0 ? 'You' : 'Opponent'
  if (isUnit(card)) {
    const unit = newUnit(s, card, side, !accelerate)
    const bf = options.battlefield != null ? s.battlefields[options.battlefield] : null
    if (bf && bf.controller === side) {
      bf.units.push(unit)
      log(s, side, 'play', `${who} played ${card.name} to ${bfName(s, options.battlefield!)}${accelerate ? ' (accelerated)' : ''}.`, card)
    } else {
      p.base.push(unit)
      log(s, side, 'play', `${who} played ${card.name}${accelerate ? ' (accelerated, ready)' : ''}.`, card)
    }
  } else if (isGear(card)) {
    p.gear.push({ uid: uid(s), card, exhausted: false })
    log(s, side, 'play', `${who} played ${card.name}.`, card)
  } else {
    p.trash.push(card)
    log(s, side, 'spell', `${who} cast ${card.name}: resolve it with the tools.`, card)
  }
  checkWin(s)
  return s
}

// ---------- moving, combat, scoring ----------

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

/** Whether `units` (all `side`'s, all ready) can make a standard move to `to`. */
export function canMove(state: GameState, side: Side, unitUids: string[], to: 'base' | number): boolean {
  if (state.phase !== 'main' || state.active !== side || !unitUids.length) return false
  return unitUids.every((id) => {
    const unit = allUnits(state).find((u) => u.uid === id)
    const from = whereIs(state, id)
    if (!unit || unit.owner !== side || unit.exhausted || from == null || from === to) return false
    // Battlefield to battlefield needs Ganking.
    return from === 'base' || to === 'base' || unit.keywords.ganking
  })
}

/**
 * A standard move: the units exhaust and go to `to` together. At a battlefield with enemy units that
 * starts combat; at one without, you take control and conquer it.
 */
export function move(state: GameState, side: Side, unitUids: string[], to: 'base' | number): GameState {
  if (!canMove(state, side, unitUids, to)) return state
  const s = clone(state)
  const moving = unitUids.map((id) => takeUnit(s, id)!).filter(Boolean)
  for (const u of moving) u.exhausted = true
  const who = side === 0 ? 'You' : 'Opponent'
  const names = moving.map((u) => u.card.name).join(', ')
  if (to === 'base') {
    s.players[side].base.push(...moving)
    log(s, side, 'move', `${who} moved ${names} to base.`)
    return s
  }
  const bf = s.battlefields[to]
  bf.units.push(...moving)
  log(s, side, 'move', `${who} moved ${names} to ${bfName(s, to)}.`)
  if (bf.units.some((u) => u.owner !== side)) combat(s, to, side)
  else if (bf.controller !== side) takeControl(s, to, side)
  checkWin(s)
  return s
}

function takeControl(s: GameState, index: number, side: Side) {
  const bf = s.battlefields[index]
  bf.controller = side
  const p = s.players[side]
  if (bf.scored.includes(side)) {
    log(s, side, 'score', `${side === 0 ? 'You' : 'Opponent'} took ${bfName(s, index)} (already scored this turn).`)
    return
  }
  bf.scored.push(side)
  // The last point by conquering needs every battlefield scored this turn; otherwise it's a card instead.
  const lastPoint = p.points + 1 >= VICTORY_SCORE
  if (lastPoint && !s.battlefields.every((b) => b.scored.includes(side))) {
    draw(s, side)
    log(s, side, 'score', `${side === 0 ? 'You' : 'Opponent'} conquered ${bfName(s, index)}, but the last point needs every battlefield scored this turn: drew a card instead.`)
    return
  }
  p.points += 1
  log(s, side, 'score', `${side === 0 ? 'You' : 'Opponent'} conquered ${bfName(s, index)}: +1 (${p.points}).`)
}

/** A unit's Might in this combat: printed, plus buffs, plus Assault when attacking or Shield when defending. */
export function combatMight(u: Unit, attacking: boolean): number {
  return Math.max(0, u.might + u.bonus + (attacking ? u.keywords.assault : u.keywords.shield))
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
    const lethal = Math.max(1, combatMight(u, !defending) - u.damage)
    const dealt = Math.min(lethal, remaining)
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
  const who = attacker === 0 ? 'You' : 'Opponent'
  log(
    s,
    attacker,
    'combat',
    `Combat at ${bfName(s, index)}: ${who === 'You' ? 'your' : 'their'} ${attackMight} Might against ${defendMight}.` +
      (dead.length ? ` ${dead.map((u) => u.card.name).join(', ')} died.` : ' Nothing died.'),
  )
  for (const u of dead) kill(s, u.uid)
  const attackersLeft = bf.units.filter((u) => u.owner === attacker)
  const defendersLeft = bf.units.filter((u) => u.owner !== attacker)
  if (attackersLeft.length && defendersLeft.length) {
    // Both still there: the attackers go back to base.
    bf.units = defendersLeft
    s.players[attacker].base.push(...attackersLeft)
    log(s, attacker, 'combat', `${who === 'You' ? 'Your' : 'Their'} survivors went back to base.`)
  } else if (attackersLeft.length) {
    takeControl(s, index, attacker)
  }
  // Damage heals after combat.
  for (const u of bf.units) u.damage = 0
  for (const u of s.players[attacker].base) u.damage = 0
}

function kill(s: GameState, unitUid: string, why?: string) {
  const unit = takeUnit(s, unitUid)
  if (!unit) return
  // Tokens leave the game; cards go to their owner's trash.
  if (!unit.card.subtypes.includes('Token')) s.players[unit.owner].trash.push(unit.card)
  if (why) log(s, unit.owner, 'tool', `${unit.card.name} died (${why}).`)
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
      if (u.damage >= u.might + u.bonus) kill(s, u.uid, 'damage')
      break
    }
    case 'buff': {
      const u = find(tool.unit)
      if (!u) return state
      u.bonus += tool.amount
      log(s, u.owner, 'tool', `${u.card.name}: ${tool.amount > 0 ? '+' : ''}${tool.amount} Might (${u.might + u.bonus}).`)
      if (u.might + u.bonus <= 0 || u.damage >= u.might + u.bonus) kill(s, u.uid, 'no Might left')
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
      if (!u.card.subtypes.includes('Token')) s.players[u.owner].hand.push(u.card)
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

export { allUnits }
