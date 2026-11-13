import type { Card, Deck } from '../types'
import { chosenChampionId } from '../games/riftbound'
import {
  allUnits,
  canMove,
  canPlay,
  combatMight,
  endTurn,
  energyCost,
  isSpell,
  keywordsOf,
  mightNow,
  move,
  mulligan,
  other,
  pass,
  play,
  whereIs,
  type DeckSetup,
  type GameState,
  type Side,
  type Unit,
} from './riftbound'
import { scriptOf } from './riftboundEffects'

/**
 * The practice opponent for Riftbound (riftbound.ts runs the game). It plays a real recent list from
 * the Community lists, one decision at a time (botAct), so the board can show each move and a
 * showdown can stop for your answer.
 *
 * - Easy: plays its most expensive cards and attacks where it obviously wins, now and then missing a play.
 * - Normal: tries each play and each way of moving its units out on a copy of the game, and keeps the
 *   one that leaves it best off (evaluate: points, battlefields held, Might on the board, cards).
 * - Hard: the same, also counting what you could take back on your next turn, and answering your
 *   attacks with its Actions and Reactions.
 * It plays only the cards whose text it understands (riftboundEffects.ts); others it plays for their
 * body (units, gear) or keeps (spells).
 */

export const BOT: Side = 1
export type Level = 'easy' | 'normal' | 'hard'

export interface Weights {
  /** Per point ahead. */
  points: number
  /** Per battlefield held more than the opponent: a point each next turn. */
  control: number
  /** Per point of Might more on the board. */
  might: number
  /** Per card more in hand. */
  cards: number
  /** Per battlefield the opponent can likely take back next turn (Hard). */
  threat: number
  /** Per ready unit left at home, able to defend (Hard). */
  reserve: number
}

/** Tuned by bot-vs-bot games (scripts/tune-riftbound-bot.ts). */
export const DEFAULT_WEIGHTS: Weights = { points: 10, control: 6, might: 0.6, cards: 0.8, threat: 4, reserve: 0.3 }

/** A deck (yours, or a Community list read with listDeck) as the game wants it. */
export function setupFromDeck(deck: Pick<Deck, 'zones' | 'freeTextZones'>, cardsById: Map<string, Card>): DeckSetup {
  const cardsIn = (zoneId: string) =>
    (deck.zones[zoneId] ?? []).flatMap((e) => {
      const card = cardsById.get(e.cardId)
      return card ? Array.from({ length: e.quantity }, () => card) : []
    })
  const legend = cardsIn('legend')[0] ?? null
  const championId = chosenChampionId(deck as Deck, cardsById, legend ?? undefined)
  const main = cardsIn('main')
  const championAt = championId ? main.findIndex((c) => c.id === championId) : -1
  const champion = championAt >= 0 ? main.splice(championAt, 1)[0] : null
  const runes = (deck.freeTextZones.runes ?? []).flatMap((e) => Array.from({ length: e.quantity }, () => e.label))
  return { main, champion, legend, battlefields: cardsIn('battlefields'), runes }
}

/** The bot's mulligan: up to two cards costing 5 or more go back. */
export function botMulligan(state: GameState, side: Side = BOT): GameState {
  const hand = state.players[side].hand
  const dear = hand
    .map((card, i) => ({ i, cost: energyCost(card) }))
    .filter((c) => c.cost >= 5)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 2)
    .map((c) => c.i)
  return mulligan(state, side, dear)
}

/** "Deal 3 to a unit": what an easy bot recognises. */
export function damageSpell(card: Card): number | null {
  if (!isSpell(card)) return null
  const m = /\bdeal (\d+)(?: damage)? to (?:a|an|target)(?: enemy)? unit\b/i.exec(card.text ?? '')
  return m ? Number(m[1]) : null
}

/** Whether it's `side`'s move: its own turn with no showdown open, or a showdown waiting on it. */
export function botShouldAct(s: GameState, side: Side = BOT): boolean {
  if (s.phase === 'mulligan') return !s.kept.includes(side)
  if (s.phase !== 'main') return false
  return s.showdown ? s.showdown.focus === side : s.active === side
}

// ---------- judging a position ----------

const boardMight = (s: GameState, side: Side) => allUnits(s, side).reduce((n, u) => n + mightNow(u), 0)

/** Battlefields `side` holds that the opponent could take next turn with everything it has. */
function threatened(s: GameState, side: Side): number {
  const foe = other(side)
  const attack = allUnits(s, foe).reduce((n, u) => n + combatMight(u, true), 0)
  return s.battlefields.filter((bf) => {
    if (bf.controller !== side) return false
    const defence = bf.units.filter((u) => u.owner === side).reduce((n, u) => n + combatMight(u, false), 0)
    return attack > defence
  }).length
}

/** How good the position is for `side` (higher is better). */
export function evaluate(s: GameState, side: Side, w: Weights = DEFAULT_WEIGHTS, level: Level = 'normal'): number {
  if (s.phase === 'over') return s.winner === side ? 100000 : -100000
  const me = s.players[side]
  const foe = s.players[other(side)]
  const held = (x: Side) => s.battlefields.filter((b) => b.controller === x).length
  let score =
    w.points * (me.points - foe.points) +
    w.control * (held(side) - held(other(side))) +
    w.might * (boardMight(s, side) - boardMight(s, other(side))) +
    w.cards * (me.hand.length - foe.hand.length)
  // Close to 8, every point is worth more.
  score += w.points * 0.5 * (Math.max(0, me.points - 4) ** 2 - Math.max(0, foe.points - 4) ** 2)
  if (level === 'hard') {
    score -= w.threat * threatened(s, side)
    score += w.reserve * me.base.filter((u) => !u.exhausted).reduce((n, u) => n + combatMight(u, false), 0)
  }
  return score
}

// ---------- choosing ----------

interface Option {
  state: GameState
  value: number
}

/** Every card `side` could play now, each played once with the best targets (and Accelerated when it can). */
function playOptions(s: GameState, side: Side, level: Level): GameState[] {
  const out: GameState[] = []
  const p = s.players[side]
  const cards: { card: Card; i: number }[] = p.hand.map((card, i) => ({ card, i }))
  if (p.champion) cards.push({ card: p.champion, i: -1 })
  const seen = new Set<string>()
  for (const { card, i } of cards) {
    if (seen.has(card.id) || !canPlay(s, side, card)) continue
    seen.add(card.id)
    // Spells only when it knows what they do (Easy: only plain damage).
    if (isSpell(card) && (level === 'easy' ? damageSpell(card) == null : !scriptOf(card).full)) continue
    out.push(play(s, side, i))
    if (keywordsOf(card).accelerate && canPlay(s, side, card, true)) out.push(play(s, side, i, { accelerate: true }))
  }
  return out.filter((x) => x !== s)
}

/**
 * The best way to move `side`'s ready units: each to stay, or to one of the battlefields (with
 * Ganking, between them too), tried on a copy with combat at once. Returns the first group of moves
 * of the best plan (one destination), or null when staying put is best.
 */
function bestMove(s: GameState, side: Side, w: Weights, level: Level): { units: string[]; to: number | 'base' } | null {
  const ready = allUnits(s, side)
    .filter((u) => !u.exhausted)
    .sort((a, b) => mightNow(b) - mightNow(a))
    .slice(0, 6)
  if (!ready.length) return null
  const dests: (number | 'base' | null)[] = [null, ...s.battlefields.map((_, i) => i)]
  let best: { value: number; plan: Map<number | 'base', string[]> } = { value: evaluate(s, side, w, level), plan: new Map() }
  const assign = new Array<number | 'base' | null>(ready.length).fill(null)
  const tryPlan = () => {
    const plan = new Map<number | 'base', string[]>()
    assign.forEach((to, k) => {
      if (to == null || whereIs(s, ready[k].uid) === to) return
      plan.set(to, [...(plan.get(to) ?? []), ready[k].uid])
    })
    if (!plan.size) return
    let t = s
    // Empty battlefields first, then fights.
    const order = [...plan.keys()].sort((a, b) => Number(hasEnemies(s, a, side)) - Number(hasEnemies(s, b, side)))
    for (const to of order) {
      const ids = plan.get(to)!
      if (!canMove(t, side, ids, to)) return
      t = move(t, side, ids, to, true)
    }
    const value = evaluate(t, side, w, level)
    if (value > best.value + 0.01) best = { value, plan }
  }
  const walk = (k: number) => {
    if (k === ready.length) return tryPlan()
    for (const d of dests) {
      assign[k] = d
      walk(k + 1)
    }
  }
  walk(0)
  if (!best.plan.size) return null
  const first = [...best.plan.keys()].sort((a, b) => Number(hasEnemies(s, a, side)) - Number(hasEnemies(s, b, side)))[0]
  return { units: best.plan.get(first)!, to: first }
}

const hasEnemies = (s: GameState, to: number | 'base', side: Side) => to !== 'base' && s.battlefields[to].units.some((u) => u.owner !== side)

/** In a showdown: cast the Action or Reaction that leaves it best off once combat is over, or pass. */
function showdownAct(s: GameState, side: Side, w: Weights, level: Level): GameState {
  const resolved = (t: GameState) => {
    // Both pass from here: combat happens.
    let r = t
    for (let i = 0; i < 2 && r.showdown; i++) r = pass(r, r.showdown.focus)
    return evaluate(r, side, w, level)
  }
  const passing = pass(s, side)
  let best: Option = { state: passing, value: resolved(passing) }
  if (level !== 'hard') return passing
  s.players[side].hand.forEach((card, i) => {
    if (!canPlay(s, side, card) || !scriptOf(card).full) return
    const t = play(s, side, i)
    if (t === s) return
    const value = resolved(t)
    if (value > best.value + 0.5) best = { state: t, value }
  })
  return best.state
}

/** Easy: the old, simple plan, with a chance of missing a play. */
function easyAct(s: GameState, side: Side, random: () => number): GameState {
  const options = playOptions(s, side, 'easy')
  if (options.length && random() > 0.15) {
    return options.sort((a, b) => boardMight(b, side) - boardMight(a, side))[0]
  }
  for (const [index, bf] of s.battlefields.entries()) {
    const ready = s.players[side].base.filter((u) => !u.exhausted)
    if (!ready.length) break
    const enemies = bf.units.filter((u) => u.owner !== side)
    if (!enemies.length && bf.controller !== side) {
      const smallest = [...ready].sort((a, b) => mightNow(a) - mightNow(b))[0]
      return move(s, side, [smallest.uid], index)
    }
    const theirs = enemies.reduce((n, u) => n + combatMight(u, false), 0)
    const group: Unit[] = []
    let ours = 0
    for (const u of [...ready].sort((a, b) => combatMight(b, true) - combatMight(a, true))) {
      if (ours > theirs) break
      group.push(u)
      ours += combatMight(u, true)
    }
    if (enemies.length && ours > theirs) return move(s, side, group.map((u) => u.uid), index)
  }
  return endTurn(s)
}

/**
 * The bot's next decision for `side`: a mulligan, one play, one move, a showdown answer, or ending its
 * turn. Call it again while botShouldAct says so.
 */
export function botAct(s: GameState, side: Side = BOT, level: Level = 'normal', w: Weights = DEFAULT_WEIGHTS, random: () => number = Math.random): GameState {
  if (s.phase === 'mulligan') return botMulligan(s, side)
  if (!botShouldAct(s, side)) return s
  if (s.showdown) return showdownAct(s, side, w, level)
  if (level === 'easy') return easyAct(s, side, random)

  // A play that leaves it better off (units nearly always do; spells when their effect pays).
  const now = evaluate(s, side, w, level)
  const plays = playOptions(s, side, level).map((state) => ({ state, value: evaluate(state, side, w, level) }))
  const bestPlay = plays.sort((a, b) => b.value - a.value)[0]
  if (bestPlay && bestPlay.value > now - 0.5) return bestPlay.state

  const mv = bestMove(s, side, w, level)
  if (mv) {
    const next = move(s, side, mv.units, mv.to)
    if (next !== s) return next
  }
  return endTurn(s)
}
