import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import {
  applyTool,
  attack,
  attackTargets,
  block,
  canAttackWith,
  choose,
  counter,
  endTurn,
  giveDon,
  keywordsOf,
  mulligan,
  newGame,
  play,
  powerNow,
  resolveBattle,
  resolveTrigger,
  type GameState,
} from './onepiece'
import { sectionsOf } from './onepieceEffects'
import { botAct, botShouldAct, counterValue } from './onepieceBot'

let n = 0
function card(category: string, text: string, cost: number | null = null, name = `${category} ${++n}`): Card {
  return {
    id: `onepiece:T-${name}`,
    gameId: 'onepiece',
    sourceId: `T-${name}`,
    name,
    imageUrl: null,
    imageUrlSmall: null,
    orientation: 'portrait',
    setId: 'T',
    setName: 'Test',
    setCode: 'T',
    number: '1',
    rarity: null,
    category,
    subtypes: [],
    colors: ['Red'],
    cost: cost == null ? null : String(cost),
    text,
    legality: null,
  }
}

const leader = card('Leader', 'Power: 5000\nLife: 4', null, 'Leader')
const vanilla = (cost: number, power: number, counterValue = 1000, extra = '') => card('Character', `Power: ${power}\nCounter: ${counterValue}\n${extra}`, cost)

function seeded(seed = 1) {
  let x = seed
  return () => {
    x = (x * 16807) % 2147483647
    return (x - 1) / 2147483646
  }
}

function deck(cards: Card[]) {
  return { leader, main: Array.from({ length: 50 }, (_, i) => cards[i % cards.length]) }
}

/** Both kept, you first: you on turn 1. */
function started(you: Card[], them: Card[], seed = 1): GameState {
  let g = newGame(deck(you), deck(them), { first: 0, random: seeded(seed), humans: [0] })
  g = mulligan(g, 0, false)
  return mulligan(g, 1, false)
}

/** Gives side 0 a card in hand at index 0. */
function withHand(g: GameState, c: Card): GameState {
  const s = structuredClone(g)
  s.players[0].hand.unshift(c)
  return s
}

describe('One Piece practice game', () => {
  it('deals Life, gives one DON!! on the first turn and two after, with a draw for the second player', () => {
    const g = started([vanilla(1, 2000)], [vanilla(1, 2000)])
    expect(g.phase).toBe('main')
    expect(g.players[0].life).toHaveLength(4)
    expect(g.players[0].hand).toHaveLength(5)
    expect(g.players[0].donActive).toBe(1)
    const t2 = endTurn(g)
    expect(t2.active).toBe(1)
    expect(t2.players[1].hand).toHaveLength(6)
    expect(t2.players[1].donActive).toBe(2)
    const t3 = endTurn(t2)
    expect(t3.players[0].donActive).toBe(3)
    expect(t3.turn).toBe(2)
  })

  it("pays for Characters with DON!!, and they can't attack the turn they come in or on your first turn", () => {
    let g = started([vanilla(1, 3000)], [vanilla(1, 2000)])
    g = play(g, 0, 0)
    expect(g.players[0].characters).toHaveLength(1)
    expect(g.players[0].donActive).toBe(0)
    expect(g.players[0].donRested).toBe(1)
    expect(canAttackWith(g, 0, g.players[0].leader!.uid)).toBe(false)
    g = endTurn(endTurn(g))
    expect(g.players[0].donActive).toBe(3)
    expect(canAttackWith(g, 0, g.players[0].characters[0].uid)).toBe(true)
    expect(canAttackWith(g, 0, g.players[0].leader!.uid)).toBe(true)
  })

  it('a Leader hit loses a Life card to hand; with no Life left, the game', () => {
    let g = endTurn(endTurn(started([vanilla(1, 2000)], [vanilla(1, 2000)])))
    const me = g.players[0].leader!.uid
    const them = g.players[1].leader!.uid
    g = giveDon(g, 0, me, 1)
    expect(powerNow(g, g.players[0].leader!)).toBe(6000)
    g = attack(g, 0, me, them)
    g = block(g, 1, null)
    const hand = g.players[1].hand.length
    g = resolveBattle(g, 1)
    expect(g.players[1].life).toHaveLength(3)
    expect(g.players[1].hand.length).toBe(hand + 1)
    const s = structuredClone(g)
    s.players[1].life = []
    s.players[0].leader!.rested = false
    let over = attack(s, 0, me, them)
    over = resolveBattle(block(over, 1, null), 1)
    expect(over.phase).toBe('over')
    expect(over.winner).toBe(0)
  })

  it('counters: a Character trashed for its Counter value holds the attack off for this battle', () => {
    let g = endTurn(endTurn(started([vanilla(1, 2000)], [vanilla(1, 2000, 2000)])))
    g = attack(g, 0, g.players[0].leader!.uid, g.players[1].leader!.uid)
    g = block(g, 1, null)
    const i = g.players[1].hand.findIndex((c) => c.category === 'Character')
    g = counter(g, 1, i)
    expect(powerNow(g, g.players[1].leader!)).toBe(7000)
    g = resolveBattle(g, 1)
    expect(g.players[1].life).toHaveLength(4)
    expect(powerNow(g, g.players[1].leader!)).toBe(5000)
  })

  it('a Blocker steps in and is K.O.d when it loses', () => {
    const wall = vanilla(1, 1000, 1000, '[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)')
    let g = started([vanilla(1, 2000)], [wall])
    g = endTurn(g)
    g = play(g, 1, g.players[1].hand.findIndex((c) => c.id === wall.id))
    g = endTurn(g)
    g = attack(g, 0, g.players[0].leader!.uid, g.players[1].leader!.uid)
    expect(g.battle!.step).toBe('block')
    g = block(g, 1, g.players[1].characters[0].uid)
    g = resolveBattle(g, 1)
    expect(g.players[1].characters).toHaveLength(0)
    expect(g.players[1].life).toHaveLength(4)
  })

  it('reads keywords and common card text', () => {
    expect(keywordsOf(vanilla(3, 4000, 0, '[Rush] (This card can attack on the turn in which it is played.)')).rush).toBe(true)
    expect(keywordsOf(vanilla(3, 4000, 0, '[On Play] Up to 1 of your Characters gains [Rush] during this turn.')).rush).toBe(false)
    const ko = sectionsOf(card('Event', "[Main] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.", 2))
    expect(ko[0].effects).toEqual([{ kind: 'ko', maxCost: 3 }])
    expect(ko[0].leftover).toBeNull()
    const partly = sectionsOf(card('Event', '[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle. Then, if you have 2 or less Life cards, draw 1 card.', 1))
    expect(partly[0].effects).toHaveLength(1)
    expect(partly[0].leftover).toMatch(/2 or less Life/)
    expect(counterValue(card('Event', '[Counter] Your Leader gains +3000 power during this battle.', 1))).toBe(3000)
  })

  it('an On Play K.O. waits for your pick when there are several, and runs for the bot by itself', () => {
    const killer = vanilla(1, 1000, 0, "[On Play] K.O. up to 1 of your opponent's Characters with a cost of 3 or less.")
    let g = started([vanilla(1, 2000)], [vanilla(1, 2000)])
    const s = structuredClone(g)
    s.players[1].characters = []
    g = s
    // Two of theirs on the field.
    g = applyTool(withHand(g, vanilla(1, 2000)), { kind: 'draw', side: 1 })
    let t = structuredClone(g)
    t.players[1].hand.unshift(vanilla(2, 3000), vanilla(1, 2000))
    t = applyTool(applyTool(t, { kind: 'playFree', side: 1, index: 0 }), { kind: 'playFree', side: 1, index: 0 })
    t = withHand(t, killer)
    t = play(t, 0, 0)
    expect(t.choices[0]?.kind).toBe('target')
    const pick = t.players[1].characters[1].uid
    t = choose(t, 0, pick)
    expect(t.players[1].characters.map((c) => c.uid)).not.toContain(pick)
  })

  it('a Life card with a Trigger asks whether to use it', () => {
    const trig = card('Event', '[Trigger] Draw 1 card.', 1)
    let g = endTurn(endTurn(started([vanilla(1, 2000)], [trig])))
    g = attack(g, 0, g.players[0].leader!.uid, g.players[1].leader!.uid)
    g = resolveBattle(block(g, 1, null), 1)
    expect(g.choices[0]?.kind).toBe('trigger')
    const hand = g.players[1].hand.length
    g = resolveTrigger(g, 1, true)
    expect(g.players[1].hand.length).toBe(hand + 1)
    expect(g.players[1].trash.map((c) => c.id)).toContain(trig.id)
  })

  it('cards in manual play are logged, not run', () => {
    const drawer = vanilla(1, 1000, 0, '[On Play] Draw 1 card.')
    let g = newGame(deck([drawer]), deck([vanilla(1, 2000)]), { first: 0, random: seeded(2), manual: true })
    g = mulligan(mulligan(g, 0, false), 1, false)
    const hand = g.players[0].hand.length
    g = play(g, 0, 0)
    expect(g.players[0].hand.length).toBe(hand - 1)
    expect(g.log.at(-1)!.text).toMatch(/Draw 1 card/)
  })

  it('bots play whole games to the end', () => {
    const pool = [
      vanilla(1, 2000, 1000),
      vanilla(2, 3000, 1000),
      vanilla(3, 4000, 2000, '[Blocker] (After your opponent declares an attack, you may rest this card to make it the new target of the attack.)'),
      vanilla(4, 5000, 1000, '[Rush]'),
      vanilla(5, 6000, 0, "[On Play] K.O. up to 1 of your opponent's Characters with a cost of 4 or less."),
      vanilla(7, 8000, 0, '[Double Attack]'),
      card('Event', '[Counter] Up to 1 of your Leader or Character cards gains +4000 power during this battle.', 1),
      card('Event', '[Main] Draw 2 cards.', 2),
    ]
    const winners: number[] = []
    for (let seed = 1; seed <= 20; seed++) {
      let g = newGame(deck(pool), deck(pool), { random: seeded(seed), humans: [] })
      for (let i = 0; i < 3000 && g.phase !== 'over'; i++) {
        const side = ([0, 1] as const).find((x) => botShouldAct(g, x))
        expect(side).not.toBeUndefined()
        const next = botAct(g, side!, seed % 2 ? 'hard' : 'normal')
        expect(next).not.toBe(g)
        g = next
      }
      expect(g.phase).toBe('over')
      winners.push(g.winner!)
    }
    expect(new Set(winners).size).toBe(2)
  })

  it('attacks only the Leader and rested Characters', () => {
    let g = endTurn(started([vanilla(1, 2000)], [vanilla(1, 2000)]))
    g = play(g, 1, 0)
    g = endTurn(g)
    expect(attackTargets(g, 0)).toEqual([g.players[1].leader!.uid])
  })
})
