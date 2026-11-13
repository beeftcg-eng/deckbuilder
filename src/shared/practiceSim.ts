import type { Card } from './types'
import { playCost, resourceRule, resourcesAt } from './practiceResources'
import { shuffled } from './sampleHand'
import { poolKey } from './collection'

/**
 * Practice's Simulate tab: the deck played against nobody, many times over, by a simple plan. Each
 * turn it draws, plays a resource card if the game has them (a land, an Energy), then plays the most
 * expensive cards it can afford until nothing else fits. Card text is ignored; costs and each game's
 * resources (practiceResources.ts) are all it knows. What comes out is how the deck's curve plays:
 * how often there's something to do each turn, how much of the turn's resources get used, and when
 * each card usually comes down.
 */

export interface TurnStats {
  turn: number
  /** Share of games with at least one card played this turn (resources aside). */
  hadPlay: number
  /** Resources spent over resources available this turn, across all games (0-1); null when the game has no costs. */
  used: number | null
  /** Share of games that had no resource card to play this turn (Magic's land drop, Pokémon's Energy). */
  missedResource: number | null
  /** Average cards in hand at the end of the turn. */
  handSize: number
}

export interface CardStats {
  card: Card
  copies: number
  /** Share of games it was played in by the last simulated turn. */
  played: number
  /** Average turn it was first played, in the games it was. */
  averageTurn: number | null
}

export interface SimResult {
  games: number
  turns: TurnStats[]
  cards: CardStats[]
  /** Share of games with nothing played on turn 1 or 2 (a slow start). */
  slowStart: number
}

interface Options {
  handSize: number
  onThePlay: boolean
  turns?: number
  games?: number
  random?: () => number
}

/** Plays `cards` (the main deck, a copy per slot) `games` times; null for a game with no resource to count (Yu-Gi-Oh!). */
export function simulateDeck(gameId: Card['gameId'], cards: readonly Card[], options: Options): SimResult | null {
  const rule = resourceRule(gameId)
  if (!rule || !cards.length) return null
  const { handSize, onThePlay, turns = 6, games = 2000, random = Math.random } = options
  const paysCosts = rule.kind === 'perTurn' || rule.paysCosts
  const perTurn = Array.from({ length: turns }, () => ({ played: 0, spent: 0, available: 0, missed: 0, hand: 0 }))
  const firstTurn = new Map<string, { card: Card; copies: number; games: number; turnSum: number }>()
  for (const card of cards) {
    const key = poolKey(card)
    const seen = firstTurn.get(key)
    if (seen) seen.copies++
    else firstTurn.set(key, { card, copies: 1, games: 0, turnSum: 0 })
  }
  let slow = 0

  for (let g = 0; g < games; g++) {
    const library = shuffled(cards, random)
    const hand = library.splice(0, handSize)
    const inPlay: Card[] = []
    const firstSeen = new Map<string, number>()
    let earlyPlay = false
    for (let turn = 1; turn <= turns; turn++) {
      const t = perTurn[turn - 1]
      if (!(turn === 1 && onThePlay) && library.length) hand.push(library.shift()!)
      // A resource card first (one a turn), the cheapest kind to keep: any will do.
      if (rule.kind === 'cards') {
        const i = hand.findIndex(rule.isResource)
        if (i >= 0) inPlay.push(...hand.splice(i, 1))
        else t.missed++
      }
      const total = resourcesAt(rule, turn, onThePlay, inPlay)
      let left = total
      let playedAny = false
      // The most expensive card that fits, again and again.
      for (;;) {
        let best = -1
        let bestCost = -1
        hand.forEach((card, i) => {
          if (rule.kind === 'cards' && rule.isResource(card)) return
          const cost = playCost(rule, card)
          if (cost == null) {
            if (!paysCosts && bestCost < 0) best = i // no costs (Pokémon): anything can be played
            return
          }
          if (cost <= left && cost > bestCost) {
            best = i
            bestCost = cost
          }
        })
        if (best < 0) break
        const [card] = hand.splice(best, 1)
        inPlay.push(card)
        left -= Math.max(0, bestCost)
        playedAny = true
        const key = poolKey(card)
        if (!firstSeen.has(key)) firstSeen.set(key, turn)
        // Without costs, one card a turn stands in for "had something to do".
        if (!paysCosts) break
      }
      if (playedAny) {
        t.played++
        if (turn <= 2) earlyPlay = true
      }
      t.spent += total - left
      t.available += total
      t.hand += hand.length
    }
    if (!earlyPlay) slow++
    for (const [key, turn] of firstSeen) {
      const s = firstTurn.get(key)!
      s.games++
      s.turnSum += turn
    }
  }

  return {
    games,
    slowStart: slow / games,
    turns: perTurn.map((t, i) => ({
      turn: i + 1,
      hadPlay: t.played / games,
      used: paysCosts && t.available > 0 ? t.spent / t.available : null,
      missedResource: rule.kind === 'cards' ? t.missed / games : null,
      handSize: t.hand / games,
    })),
    cards: [...firstTurn.values()]
      .filter((s) => !(rule.kind === 'cards' && rule.isResource(s.card)))
      .map((s) => ({ card: s.card, copies: s.copies, played: s.games / games, averageTurn: s.games ? s.turnSum / s.games : null }))
      .sort((a, b) => (a.averageTurn ?? 99) - (b.averageTurn ?? 99) || a.card.name.localeCompare(b.card.name)),
  }
}

