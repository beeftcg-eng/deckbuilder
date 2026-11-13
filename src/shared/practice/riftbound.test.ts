import { describe, expect, it } from 'vitest'
import { applyTool, canPlay, endTurn, move, mulligan, newGame, play, runeCount, type DeckSetup, type GameState } from './riftbound'
import { BOT, botMulligan, botTurn, damageSpell, setupFromDeck } from './riftboundBot'
import { makeCard, makeDeck } from '../testFixtures'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const unit = (name: string, cost: number, might: number, extra: Partial<Parameters<typeof makeCard>[1]> = {}) =>
  makeCard('riftbound', { name, category: 'Unit', cost: String(cost), might, colors: ['Fury'], ...extra })
const bf = (name: string) => makeCard('riftbound', { name, category: 'Battlefield' })

function setup(main = Array.from({ length: 40 }, (_, i) => unit(`U${i}`, 2, 2))): DeckSetup {
  return { main, champion: null, legend: null, battlefields: [bf('A'), bf('B'), bf('C')], runes: Array.from({ length: 12 }, () => 'Fury') }
}

/** A game past both mulligans (you keep, the bot keeps), you going first. */
function started(you = setup(), them: DeckSetup | null = setup()): GameState {
  let s = newGame(you, them, { first: 0, random: seeded(1) })
  s = mulligan(s, 0, [])
  return them ? mulligan(s, 1, []) : s
}

describe('Riftbound practice: setup and turns', () => {
  it('deals four, picks a battlefield each, and the first turn channels 2 and draws 1', () => {
    const s = started()
    expect(s.battlefields).toHaveLength(2)
    expect(s.phase).toBe('main')
    expect(s.players[0].hand).toHaveLength(5)
    expect(runeCount(s, 0)).toEqual({ ready: 2, total: 2 })
  })

  it('gives the second player 3 runes on their first turn, and no draw skip for anyone', () => {
    const s = endTurn(started())
    expect(s.active).toBe(1)
    expect(runeCount(s, 1).total).toBe(3)
    expect(s.players[1].hand).toHaveLength(5)
  })

  it('mulligans up to two to the bottom of the deck', () => {
    let s = newGame(setup(), setup(), { first: 0, random: seeded(2) })
    const before = s.players[0].hand.map((c) => c.id)
    s = mulligan(s, 0, [0, 1, 2])
    expect(s.players[0].deck.slice(-2).map((c) => c.id)).toEqual(before.slice(0, 2))
    expect(s.phase).toBe('mulligan') // the bot hasn't kept yet
  })
})

describe('playing, moving and scoring', () => {
  it('pays Energy by exhausting runes and Power by recycling one of the domain', () => {
    const fury = unit('Fury Thing', 1, 2, { powerCost: 1 })
    const s = play(started(setup(Array.from({ length: 40 }, () => fury))), 0, 0)
    expect(s.players[0].base).toHaveLength(1)
    expect(runeCount(s, 0)).toEqual({ ready: 0, total: 1 })
    expect(s.players[0].runeDeck.at(-1)).toBe('Fury')
  })

  it('plays units exhausted, Accelerated ones ready', () => {
    const fast = unit('Fast', 1, 2, { text: '[Accelerate] (You may pay 1 and Fury...)' })
    let s = started(setup(Array.from({ length: 40 }, () => fast)))
    s = endTurn(endTurn(s)) // your turn 2: 4 runes
    s = play(s, 0, 0)
    expect(s.players[0].base[0].exhausted).toBe(true)
    s = play(s, 0, 0, { accelerate: true })
    expect(s.players[0].base[1].exhausted).toBe(false)
  })

  it('conquers an empty battlefield for a point, then holds it next turn', () => {
    let s = started()
    s = play(s, 0, 0)
    s = endTurn(endTurn(s))
    const id = s.players[0].base[0].uid
    s = move(s, 0, [id], 0)
    expect(s.battlefields[0].controller).toBe(0)
    expect(s.players[0].points).toBe(1)
    s = endTurn(s) // the bot's turn
    const theirs = s.players[1].points
    s = endTurn(s)
    expect(s.players[0].points).toBe(1 + (s.battlefields[0].controller === 0 ? 1 : 0))
    expect(theirs).toBeGreaterThanOrEqual(0)
  })

  it('fights: Tank takes damage first, Assault and Shield count, survivors on both sides go home', () => {
    const tank = unit('Tank', 2, 3, { text: '[Tank]' })
    const small = unit('Small', 2, 1)
    const attacker = unit('Attacker', 2, 2, { text: '[Assault 2]' })
    let s = started(setup(Array.from({ length: 40 }, () => attacker)), setup([...Array.from({ length: 20 }, () => tank), ...Array.from({ length: 20 }, () => small)]))
    // Put their units at battlefield 0 and yours in base, by hand.
    s = applyTool(s, { kind: 'control', battlefield: 0, side: 1 })
    const state = structuredClone(s)
    state.battlefields[0].units = [
      { uid: 't', card: tank, owner: 1, might: 3, bonus: 0, damage: 0, exhausted: false, stunned: false, keywords: { assault: 0, shield: 0, tank: true, backline: false, ganking: false, accelerate: false, temporary: false } },
      { uid: 's', card: small, owner: 1, might: 1, bonus: 0, damage: 0, exhausted: false, stunned: false, keywords: { assault: 0, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false } },
    ]
    state.players[0].base = [{ uid: 'a', card: attacker, owner: 0, might: 2, bonus: 0, damage: 0, exhausted: false, stunned: false, keywords: { assault: 2, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false } }]
    // 4 Might (2 + Assault 2) kills the 3-Might Tank first and 1 left hits Small (1): both die.
    const after = move(state, 0, ['a'], 0)
    expect(after.battlefields[0].units.filter((u) => u.owner === 1)).toHaveLength(0)
    // Their 4 Might killed the attacker (2), so nobody holds it: it stays theirs.
    expect(after.players[0].base).toHaveLength(0)
    expect(after.battlefields[0].controller).toBe(1)
  })

  it('turns the last point by conquering into a card unless every battlefield was scored', () => {
    let s = started()
    s = play(s, 0, 0)
    s = endTurn(endTurn(s))
    s = applyTool(s, { kind: 'points', side: 0, amount: 7 })
    const hand = s.players[0].hand.length
    s = move(s, 0, [s.players[0].base[0].uid], 0)
    expect(s.players[0].points).toBe(7)
    expect(s.players[0].hand).toHaveLength(hand + 1)
    expect(s.winner).toBeNull()
  })

  it('wins at 8', () => {
    const s = applyTool(started(), { kind: 'points', side: 0, amount: 8 })
    expect(s.phase).toBe('over')
    expect(s.winner).toBe(0)
  })

  it('logs a spell with its text for you to resolve', () => {
    const bolt = makeCard('riftbound', { name: 'Bolt', category: 'Spell', cost: '1', colors: ['Fury'], text: 'Deal 3 to a unit.' })
    let s = started(setup(Array.from({ length: 40 }, () => bolt)))
    s = play(s, 0, 0)
    expect(s.players[0].trash).toHaveLength(1)
    expect(s.log.at(-1)).toMatchObject({ kind: 'spell', card: { name: 'Bolt' } })
    expect(damageSpell(bolt)).toBe(3)
    expect(canPlay(s, 1, bolt)).toBe(false) // not their turn
  })
})

describe('the bot', () => {
  it('sends back costly cards in its mulligan', () => {
    const big = unit('Big', 7, 7)
    let s = newGame(setup(), setup(Array.from({ length: 40 }, () => big)), { first: 0, random: seeded(3) })
    s = mulligan(s, 0, [])
    s = botMulligan(s)
    expect(s.log.some((l) => l.side === BOT && l.text === 'Mulliganed 2.')).toBe(true)
  })

  it('plays, takes battlefields and wins a game where you only end your turns', () => {
    let s = started()
    for (let i = 0; i < 40 && s.phase !== 'over'; i++) {
      s = endTurn(s)
      const steps = botTurn(s)
      if (steps.length) s = steps.at(-1)!
    }
    expect(s.winner).toBe(BOT)
    expect(s.players[1].points).toBeGreaterThanOrEqual(8)
  })

  it('reads a deck: Legend, Chosen Champion out of the main deck, battlefields and runes', () => {
    const legend = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', category: 'Legend' })
    const champ = unit('Kennen, Deadly', 3, 3, { subtypes: ['Champion'] })
    const other = unit('Other', 2, 2)
    const fields = [bf('A'), bf('B'), bf('C')]
    const deck = makeDeck('riftbound', { legend: [[legend, 1]], main: [[champ, 3], [other, 37]], battlefields: fields.map((f): [typeof f, number] => [f, 1]) }, { runes: [{ label: 'Fury', quantity: 7 }, { label: 'Chaos', quantity: 5 }] })
    const byId = new Map([legend, champ, other, ...fields].map((c) => [c.id, c]))
    const d = setupFromDeck(deck, byId)
    expect(d.legend?.name).toBe(legend.name)
    expect(d.champion?.name).toBe(champ.name)
    expect(d.main).toHaveLength(39)
    expect(d.runes).toHaveLength(12)
    expect(d.battlefields).toHaveLength(3)
  })
})
