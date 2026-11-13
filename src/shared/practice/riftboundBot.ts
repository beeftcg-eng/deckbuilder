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
  move,
  mulligan,
  play,
  runeCount,
  applyTool,
  type DeckSetup,
  type GameState,
  type Side,
  type Unit,
} from './riftbound'

/**
 * The practice opponent for Riftbound (riftbound.ts runs the game). It plays a real recent list from
 * the Community lists and plays it the way a simple, aggressive player would:
 * - keeps cheap hands, sending back what costs 5 or more;
 * - plays its Champion and then its most expensive cards first, Accelerating when it has runes to spare;
 * - casts only the spells it can read ("Deal 3 to a unit"), at a unit that dies to it; the rest stay
 *   in hand, since it can't tell what they'd do;
 * - takes empty battlefields with its smallest ready unit, and attacks where its ready units can kill
 *   every defender and keep one alive.
 * It never blocks with tricks or reacts: a sparring partner that sets the pace, not a judge of the rules.
 */

export const BOT: Side = 1

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
export function botMulligan(state: GameState): GameState {
  const hand = state.players[BOT].hand
  const dear = hand
    .map((card, i) => ({ i, cost: energyCost(card) }))
    .filter((c) => c.cost >= 5)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 2)
    .map((c) => c.i)
  return mulligan(state, BOT, dear)
}

/** "Deal 3 to a unit", "deal 2 damage to an enemy unit": a spell the bot can aim. */
export function damageSpell(card: Card): number | null {
  if (!isSpell(card)) return null
  const m = /\bdeal (\d+)(?: damage)? to (?:a|an|target)(?: enemy)? unit\b/i.exec(card.text ?? '')
  return m ? Number(m[1]) : null
}

const toughness = (u: Unit, attacking: boolean) => combatMight(u, attacking) - u.damage

/** Each step of the bot's turn, for the board to show one at a time; the last one is the human's turn. */
export function botTurn(start: GameState): GameState[] {
  const steps: GameState[] = []
  let s = start
  const push = (next: GameState) => {
    if (next !== s) {
      s = next
      steps.push(s)
    }
  }
  if (s.phase !== 'main' || s.active !== BOT) return steps

  // 1. Removal it can read, at the biggest of your units it kills.
  for (;;) {
    const hand = s.players[BOT].hand
    const pick = hand
      .map((card, i) => ({ card, i, dmg: damageSpell(card) }))
      .filter((x) => x.dmg != null && canPlay(s, BOT, x.card))
      .map((x) => ({ ...x, target: allUnits(s, 0).filter((u) => toughness(u, false) <= x.dmg!).sort((a, b) => combatMight(b, false) - combatMight(a, false))[0] }))
      .find((x) => x.target)
    if (!pick) break
    push(play(s, BOT, pick.i))
    push(applyTool(s, { kind: 'damage', unit: pick.target!.uid, amount: pick.dmg! }))
  }

  // 2. The Champion, then the most expensive units and gear that fit, Accelerating with runes to spare.
  if (s.players[BOT].champion && canPlay(s, BOT, s.players[BOT].champion!)) push(play(s, BOT, -1))
  for (;;) {
    const hand = s.players[BOT].hand
    const options = hand.map((card, i) => ({ card, i })).filter((x) => !isSpell(x.card) && canPlay(s, BOT, x.card))
    if (!options.length) break
    const best = options.sort((a, b) => energyCost(b.card) - energyCost(a.card))[0]
    const spare = runeCount(s, BOT).ready - energyCost(best.card)
    const accelerate = keywordsOf(best.card).accelerate && spare >= 2 && canPlay(s, BOT, best.card, true)
    push(play(s, BOT, best.i, { accelerate }))
  }

  // 3. Moves: empty battlefields first, then attacks it wins.
  s.battlefields.forEach((bf, index) => {
    const ready = () => s.players[BOT].base.filter((u) => !u.exhausted)
    if (bf.controller === BOT && !bf.units.some((u) => u.owner !== BOT)) return
    const enemies = bf.units.filter((u) => u.owner !== BOT)
    if (!enemies.length) {
      const smallest = ready().sort((a, b) => combatMight(a, true) - combatMight(b, true))[0]
      if (smallest && canMove(s, BOT, [smallest.uid], index)) push(move(s, BOT, [smallest.uid], index))
      return
    }
    const needed = enemies.reduce((n, u) => n + toughness(u, false), 0)
    const theirMight = enemies.filter((u) => !u.stunned).reduce((n, u) => n + combatMight(u, false), 0)
    const group: Unit[] = []
    let might = 0
    for (const u of ready().sort((a, b) => combatMight(b, true) - combatMight(a, true))) {
      if (might >= needed) break
      group.push(u)
      might += combatMight(u, true)
    }
    const ourToughness = group.reduce((n, u) => n + toughness(u, true), 0)
    if (might >= needed && theirMight < ourToughness && canMove(s, BOT, group.map((u) => u.uid), index)) {
      push(move(s, BOT, group.map((u) => u.uid), index))
    }
  })

  if (s.phase === 'main') push(endTurn(s))
  return steps
}
