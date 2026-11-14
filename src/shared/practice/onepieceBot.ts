import type { Card, Deck } from '../types'
import {
  attack,
  attackTargets,
  block,
  blockers,
  canAttackWith,
  canCounter,
  canPlay,
  choose,
  costOf,
  counter,
  counterOf,
  endTurn,
  findPiece,
  giveDon,
  isCharacter,
  isEvent,
  isLeader,
  MAX_CHARACTERS,
  mulligan,
  other,
  play,
  powerNow,
  resolveBattle,
  resolveTrigger,
  toMove,
  type DeckSetup,
  type GameState,
  type Piece,
  type Side,
} from './onepiece'
import { sectionFor } from './onepieceEffects'

/**
 * The practice opponent for One Piece (onepiece.ts runs the game), one decision at a time so the
 * board can show each move.
 *
 * - Easy: plays its most expensive Character it can, attacks your Leader with whatever is strong
 *   enough, and only defends when it's about to lose.
 * - Normal: also plays Events it can read, gives DON!! where it makes an attack land, attacks your
 *   rested Characters when it wins the battle, blocks and counters to protect its Life when low.
 * - Hard: the same, defending earlier and protecting its bigger Characters too.
 */

export const BOT: Side = 1
export type Level = 'easy' | 'normal' | 'hard'

export function setupFromDeck(deck: Pick<Deck, 'zones'>, cardsById: Map<string, Card>): DeckSetup {
  const cardsIn = (zoneId: string) =>
    (deck.zones[zoneId] ?? []).flatMap((e) => {
      const card = cardsById.get(e.cardId)
      return card ? Array.from({ length: e.quantity }, () => card) : []
    })
  return { leader: cardsIn('leader')[0] ?? null, main: cardsIn('main') }
}

/** How much a card in hand adds as a counter: a Character's Counter, a [Counter] Event's +power. */
export function counterValue(card: Card): number {
  if (isCharacter(card)) return counterOf(card)
  if (!isEvent(card)) return 0
  return (sectionFor(card, 'counter')?.effects ?? []).reduce((n, e) => n + (e.kind === 'buff' && e.battle ? e.n : 0), 0)
}

export function botShouldAct(s: GameState, side: Side = BOT): boolean {
  if (s.phase === 'over' || s.players[side].empty) return false
  if (s.phase === 'mulligan') return !s.kept.includes(side)
  return toMove(s) === side
}

/** The bot's next move: one action. */
export function botAct(s: GameState, side: Side = BOT, level: Level = 'normal'): GameState {
  if (s.phase === 'mulligan') {
    // A hand with nothing to play early goes back (Easy keeps anything).
    const early = s.players[side].hand.filter((c) => isCharacter(c) && costOf(c) <= 3).length
    return mulligan(s, side, level !== 'easy' && early < 2)
  }
  const choice = s.choices[0]
  if (choice?.side === side) {
    if (choice.kind === 'trigger') return resolveTrigger(s, side, (sectionFor(choice.card, 'trigger')?.effects.length ?? 0) > 0)
    return choose(s, side, choice.legal[0] ?? null)
  }
  if (s.battle && s.battle.side !== side) return defend(s, side, level)
  return turnMove(s, side, level)
}

// ---------- defending ----------

/** How much the defending card needs to hold (0: it already does). */
function shortfall(s: GameState): number {
  const b = s.battle!
  const a = powerNow(s, findPiece(s, b.attacker)!)
  const d = powerNow(s, findPiece(s, b.target)!)
  return a >= d ? a - d + 1000 : 0
}

function worthDefending(s: GameState, side: Side, target: Piece, level: Level): boolean {
  const life = s.players[side].life.length
  if (isLeader(s, target)) {
    const attacker = findPiece(s, s.battle!.attacker)!
    if (life === 0) return true
    if (level === 'easy') return false
    if (attacker.keywords.doubleAttack && life <= 3) return true
    return life <= (level === 'hard' ? 3 : 2)
  }
  return level === 'hard' && costOf(target.card) >= 5
}

function defend(s: GameState, side: Side, level: Level): GameState {
  const b = s.battle!
  const target = findPiece(s, b.target)!
  if (b.step === 'block') {
    if (shortfall(s) > 0 && isLeader(s, target) && worthDefending(s, side, target, level)) {
      // The cheapest Blocker takes the hit.
      const cheapest = [...blockers(s)].sort((x, y) => costOf(x.card) - costOf(y.card))[0]
      if (cheapest) return block(s, side, cheapest.uid)
    }
    return block(s, side, null)
  }
  const need = shortfall(s)
  if (need > 0 && worthDefending(s, side, target, level)) {
    const hand = s.players[side].hand
    const options = hand.map((card, i) => ({ i, value: counterValue(card), card })).filter((o) => o.value > 0 && canCounter(s, side, o.card))
    // Fewest cards that cover it: the smallest single card that does, else the biggest first.
    const one = options.filter((o) => o.value >= need).sort((x, y) => x.value - y.value || costOf(x.card) - costOf(y.card))[0]
    const total = options.reduce((n, o) => n + o.value, 0)
    const most = level === 'hard' ? 3 : 2
    const biggest = [...options].sort((x, y) => y.value - x.value)
    const enough = biggest.slice(0, most).reduce((n, o) => n + o.value, 0) >= need
    if (one) return counter(s, side, one.i)
    if (enough && total >= need) return counter(s, side, biggest[0].i)
  }
  return resolveBattle(s, side)
}

// ---------- its turn ----------

function turnMove(s: GameState, side: Side, level: Level): GameState {
  const me = s.players[side]
  const opp = s.players[other(side)]

  // 1. Play: the most expensive Character it can (replacing its weakest when full), then Events it reads, then a Stage.
  const playable = me.hand.map((card, i) => ({ card, i })).filter(({ card }) => canPlay(s, side, card))
  const characters = playable.filter(({ card }) => isCharacter(card)).sort((x, y) => costOf(y.card) - costOf(x.card))
  for (const { card, i } of characters) {
    if (me.characters.length < MAX_CHARACTERS) return play(s, side, i)
    const weakest = [...me.characters].sort((x, y) => costOf(x.card) - costOf(y.card))[0]
    if (costOf(card) > costOf(weakest.card) + 1) return play(s, side, i, { replace: weakest.uid })
  }
  if (level !== 'easy') {
    const event = playable.find(({ card }) => isEvent(card) && usefulEvent(s, side, card))
    if (event) return play(s, side, event.i)
  }
  const stage = playable.find(({ card }) => card.category === 'Stage' && !me.stage)
  if (stage) return play(s, side, stage.i)

  // 2. DON!!: where it makes an attack on the Leader land, the rest to the Leader.
  const attackers = [me.leader, ...me.characters].filter((p): p is Piece => !!p && canAttackWith(s, side, p.uid))
  const theirLeader = opp.leader
  if (me.donActive > 0 && attackers.length && theirLeader) {
    const bar = powerNow(s, theirLeader) + (level === 'easy' ? 0 : 1000)
    const short = attackers
      .map((p) => ({ p, gap: Math.max(0, Math.ceil((bar - powerNow(s, p)) / 1000)) }))
      .filter((x) => x.gap > 0 && x.gap <= me.donActive)
      .sort((x, y) => x.gap - y.gap)[0]
    if (short && level !== 'easy') return giveDon(s, side, short.p.uid, short.gap)
    const leaderAttacks = me.leader && attackers.some((p) => p.uid === me.leader!.uid)
    const to = leaderAttacks ? me.leader! : [...attackers].sort((x, y) => powerNow(s, y) - powerNow(s, x))[0]
    return giveDon(s, side, to.uid, me.donActive)
  }

  // 3. Attack: Characters first (rested ones it beats, when worth it), then the Leader.
  const targets = attackTargets(s, side).map((u) => findPiece(s, u)!)
  const ordered = [...attackers].sort((x, y) => Number(isLeader(s, x)) - Number(isLeader(s, y)) || powerNow(s, x) - powerNow(s, y))
  for (const a of ordered) {
    const power = powerNow(s, a)
    if (level !== 'easy') {
      const prey = targets
        .filter((t) => !isLeader(s, t) && power >= powerNow(s, t) && costOf(t.card) >= 3)
        .sort((x, y) => costOf(y.card) - costOf(x.card))[0]
      if (prey && !(theirLeader && opp.life.length <= 1 && power >= powerNow(s, theirLeader))) return attack(s, side, a.uid, prey.uid)
    }
    if (theirLeader && power >= powerNow(s, theirLeader)) return attack(s, side, a.uid, theirLeader.uid)
  }
  return endTurn(s)
}

/** An Event worth playing now: one it reads fully whose effect has something to do. */
function usefulEvent(s: GameState, side: Side, card: Card): boolean {
  const section = sectionFor(card, 'main')
  if (!section || section.effects.length === 0) return false
  const opp = s.players[other(side)]
  return section.effects.some((e) => {
    switch (e.kind) {
      case 'draw':
      case 'addDon':
        return true
      case 'ko':
        return opp.characters.some((c) => (e.maxCost == null || costOf(c.card) <= e.maxCost) && (e.maxPower == null || powerNow(s, c) <= e.maxPower))
      case 'bounce':
        return opp.characters.some((c) => e.maxCost == null || costOf(c.card) <= e.maxCost)
      case 'rest':
        return opp.characters.some((c) => !c.rested && (e.maxCost == null || costOf(c.card) <= e.maxCost))
      default:
        return false
    }
  })
}
