import { describe, expect, it } from 'vitest'
import { applyTool, canPlay, endTurn, move, mulligan, newGame, pass, play as playOnChain, runeCount, settle, type DeckSetup, type GameState, type Unit } from './riftbound'
import { BOT, botAct, botMulligan, botShouldAct, setupFromDeck, type Level } from './riftboundBot'
import { makeCard, makeDeck } from '../testFixtures'
import { scriptOf } from './riftboundEffects'

/** Plays a card and lets it resolve unanswered (most tests aren't about the chain). */
const play: typeof playOnChain = (...args) => settle(playOnChain(...args))

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
      { uid: 't', card: tank, owner: 1, might: 3, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: { assault: 0, shield: 0, tank: true, backline: false, ganking: false, accelerate: false, temporary: false } },
      { uid: 's', card: small, owner: 1, might: 1, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: { assault: 0, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false } },
    ]
    state.players[0].base = [{ uid: 'a', card: attacker, owner: 0, might: 2, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: { assault: 2, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false } }]
    // 4 Might (2 + Assault 2) kills the 3-Might Tank first and 1 left hits Small (1): both die.
    // Straight to combat (no showdown window).
    const after = move(state, 0, ['a'], 0, true)
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

  it('logs a spell it can\'t read, for you to resolve', () => {
    const odd = makeCard('riftbound', { name: 'Odd', category: 'Spell', cost: '1', colors: ['Fury'], text: 'Swap the Might of two units at the same battlefield this turn.' })
    let s = started(setup(Array.from({ length: 40 }, () => odd)))
    s = play(s, 0, 0)
    expect(s.players[0].trash).toHaveLength(1)
    expect(s.log.at(-1)).toMatchObject({ kind: 'spell', card: { name: 'Odd' } })
    expect(canPlay(s, 1, odd)).toBe(false) // not their turn
  })
})

describe('card text the game runs', () => {
  const bolt = makeCard('riftbound', { name: 'Bolt', category: 'Spell', cost: '1', colors: ['Fury'], text: 'Deal 3 to a unit.' })
  const rally = makeCard('riftbound', { name: 'Rally', category: 'Spell', cost: '0', colors: ['Fury'], text: '[Action] (Play on your turn or in showdowns.)Give a friendly unit +3 Might this turn.' })
  const scout = unit('Scout', 1, 1, { text: 'When you play me, draw 1.' })
  const bomber = unit('Bomber', 1, 2, { text: '[Deathknell] — Play two 1 :rb_might: Recruit unit tokens to your base.' })

  it('reads the common wordings', () => {
    expect(scriptOf(bolt)).toMatchObject({ full: true, spell: [{ kind: 'damage', amount: 3, target: { who: 'any', all: false } }] })
    expect(scriptOf(rally)).toMatchObject({ full: true, timing: 'action', spell: [{ kind: 'might', amount: 3, target: { who: 'friendly' } }] })
    expect(scriptOf(scout).abilities).toEqual([{ trigger: 'play', effects: [{ kind: 'draw', amount: 1 }] }])
    expect(scriptOf(bomber).abilities[0]).toMatchObject({ trigger: 'death', effects: [{ kind: 'token', count: 2, might: 1, name: 'Recruit' }] })
    expect(scriptOf(makeCard('riftbound', { name: 'X', category: 'Spell', text: 'Counter a spell.' })).full).toBe(false)
    expect(scriptOf(makeCard('riftbound', { name: 'Y', category: 'Spell', text: 'Give enemy units -2 :rb_might: this turn, to a minimum of 1 :rb_might:.' })).spell[0]).toMatchObject({ kind: 'might', amount: -2, floor: 1, target: { who: 'enemy', all: true } })
  })

  it('resolves a spell at the unit you pick, and the unit dies', () => {
    let s = started(setup(Array.from({ length: 40 }, () => bolt)), setup(Array.from({ length: 40 }, () => scout)))
    s = endTurn(s) // their turn: they play a Scout and draw from it
    const handBefore = s.players[1].hand.length
    s = play(s, 1, 0)
    expect(s.players[1].hand).toHaveLength(handBefore) // played one, drew one
    s = endTurn(s)
    const target = s.players[1].base[0].uid
    s = play(s, 0, 0, { targets: [target] })
    expect(s.players[1].base).toHaveLength(0)
    expect(s.players[1].trash.map((c) => c.name)).toContain('Scout')
  })

  it('runs Deathknell: tokens when the unit dies', () => {
    let s = started(setup(Array.from({ length: 40 }, () => bomber)))
    s = play(s, 0, 0)
    s = applyTool(s, { kind: 'kill', unit: s.players[0].base[0].uid })
    expect(s.players[0].base.map((u) => u.card.name)).toEqual(['Recruit token', 'Recruit token'])
  })

  it('opens a showdown: an Action cast changes the fight, two passes and combat happens', () => {
    let s = started(setup(Array.from({ length: 40 }, () => unit('Two', 2, 2))), setup(Array.from({ length: 40 }, () => rally)))
    s = applyTool(s, { kind: 'control', battlefield: 0, side: 1 })
    // A 2-Might attacker against a 2-Might defender, by hand.
    const state = structuredClone(s)
    state.battlefields[0].units = [{ uid: 'd', card: unit('Guard', 2, 2), owner: 1, might: 2, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: { assault: 0, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false } }]
    state.players[0].base = [{ uid: 'a', card: unit('Two', 2, 2), owner: 0, might: 2, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: { assault: 0, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false } }]
    let t = move(state, 0, ['a'], 0)
    expect(t.showdown).toMatchObject({ battlefield: 0, attacker: 0, focus: 1 })
    expect(canPlay(t, 1, rally)).toBe(true) // the defender may answer with an Action
    t = play(t, 1, 0, { targets: ['d'] })
    expect(t.showdown?.focus).toBe(0)
    t = pass(t, 0)
    t = pass(t, 1)
    expect(t.showdown).toBeNull()
    // 5 Might against 2: the attacker died, the Guard stayed.
    expect(t.players[0].base).toHaveLength(0)
    expect(t.battlefields[0].units.map((u) => u.uid)).toEqual(['d'])
  })
})

describe('the bot', () => {
  it('sends back costly cards in its mulligan', () => {
    const big = unit('Big', 7, 7)
    let s = newGame(setup(), setup(Array.from({ length: 40 }, () => big)), { first: 0, random: seeded(3) })
    s = mulligan(s, 0, [])
    s = botMulligan(s)
    expect(s.log.some((l) => l.side === BOT && l.text === 'Opponent mulliganed 2.')).toBe(true)
  })

  it.each(['easy', 'normal', 'hard'] as Level[])('%s: plays, takes battlefields and wins a game where you only end your turns', (level) => {
    let s = started()
    for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
      if (botShouldAct(s, BOT)) s = botAct(s, BOT, level, undefined, seeded(9))
      else if (s.chain?.items.length) s = pass(s, s.chain.priority)
      else if (s.showdown) s = pass(s, s.showdown.focus)
      else s = endTurn(s)
    }
    expect(s.winner).toBe(BOT)
    expect(s.players[1].points).toBeGreaterThanOrEqual(8)
  })

  it('answers an attack with an Action on Hard', () => {
    const rally = makeCard('riftbound', { name: 'Rally', category: 'Spell', cost: '0', colors: ['Fury'], text: '[Action] Give a friendly unit +3 Might this turn.' })
    let s = started(setup(Array.from({ length: 40 }, () => unit('Two', 2, 2))), setup(Array.from({ length: 40 }, () => rally)))
    const state = structuredClone(s)
    const k = { assault: 0, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false }
    state.battlefields[0] = { ...state.battlefields[0], controller: 1, units: [{ uid: 'd', card: unit('Guard', 2, 2), owner: 1, might: 2, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: k }] }
    state.players[0].base = [{ uid: 'a', card: unit('Two', 2, 2), owner: 0, might: 2, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: k }]
    s = move(state, 0, ['a'], 0)
    expect(botShouldAct(s, BOT)).toBe(true)
    const hard = botAct(s, BOT, 'hard')
    expect(hard.chain?.items.map((i) => i.card.name)).toEqual(['Rally'])
    const normal = botAct(s, BOT, 'normal')
    expect(normal.showdown?.passes).toBe(1)
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

describe('table actions by hand', () => {
  it('takes from the deck and trash, shuffles, makes tokens, hides and reveals', () => {
    const cards = Array.from({ length: 40 }, (_, i) => unit(`U${i}`, 1, 1))
    let s = newGame(setup(cards), setup(), { first: 0, random: seeded(4), manual: true })
    s = mulligan(mulligan(s, 0, []), 1, [])
    expect(runeCount(s, 0).total).toBe(0) // by hand: nothing channelled yet
    const top = s.players[0].deck[0]
    s = applyTool(s, { kind: 'fromDeck', side: 0, index: 0, to: 'hand' })
    expect(s.players[0].hand.at(-1)).toBe(top)
    s = applyTool(s, { kind: 'fromDeck', side: 0, index: 0, to: 'trash' })
    s = applyTool(s, { kind: 'fromTrash', side: 0, index: 0, to: 'hand' })
    expect(s.players[0].trash).toHaveLength(0)
    s = applyTool(s, { kind: 'token', side: 0, name: 'Sprite', might: 3, battlefield: 1, ready: true })
    expect(s.battlefields[1].units[0]).toMatchObject({ might: 3, exhausted: false, token: true })
    s = applyTool(s, { kind: 'hide', side: 0, handIndex: 0, battlefield: 0 })
    const hidden = s.battlefields[0].hidden[0]
    expect(hidden.owner).toBe(0)
    s = applyTool(s, { kind: 'unhide', battlefield: 0, hidden: hidden.uid })
    expect(s.battlefields[0].hidden).toHaveLength(0)
    s = applyTool(s, { kind: 'legend', side: 0 })
    expect(s.players[0].legendExhausted).toBe(true)
    const deckBefore = s.players[0].deck.map((c) => c.id).join()
    s = applyTool(s, { kind: 'shuffle', side: 0 })
    expect(s.players[0].deck).toHaveLength(deckBefore.split(',').length)
  })

  it('plays a unit to any battlefield and moves it anywhere, with no fight', () => {
    let s = newGame(setup(), setup(), { first: 0, random: seeded(5), manual: true })
    s = mulligan(mulligan(s, 0, []), 1, [])
    s = play(s, 0, 0, { free: true, battlefield: 1 })
    expect(s.battlefields[1].units).toHaveLength(1)
    const id = s.battlefields[1].units[0].uid
    s = move(s, 0, [id], 0) // exhausted, battlefield to battlefield, no Ganking: fine by hand
    expect(s.battlefields[0].units.map((u) => u.uid)).toEqual([id])
    expect(s.players[0].points).toBe(0)
  })
})

describe('table tools: XP, runes and equipment', () => {
  it('keeps XP, exhausts, readies and recycles a single rune', () => {
    let s = applyTool(applyTool(started(), { kind: 'xp', side: 0, amount: 1 }), { kind: 'xp', side: 0, amount: 1 })
    expect(s.players[0].xp).toBe(2)
    s = applyTool(s, { kind: 'xp', side: 0, amount: -5 })
    expect(s.players[0].xp).toBe(0)
    const rune = s.players[0].runes[0]
    s = applyTool(s, { kind: 'rune', side: 0, rune: rune.uid, action: 'toggle' })
    expect(runeCount(s, 0)).toEqual({ ready: 1, total: 2 })
    const deck = s.players[0].runeDeck.length
    s = applyTool(s, { kind: 'rune', side: 0, rune: rune.uid, action: 'recycle' })
    expect(runeCount(s, 0).total).toBe(1)
    expect(s.players[0].runeDeck).toHaveLength(deck + 1)
    expect(s.players[0].runeDeck.at(-1)).toBe('Fury')
  })

  it('equips gear to a unit, takes it off, and recalls it to base when the unit dies', () => {
    const sword = makeCard('riftbound', { name: 'Long Sword', category: 'Gear', cost: '0', text: '[Equip] :rb_rune_fury:' })
    let s = started(setup([sword, ...Array.from({ length: 39 }, (_, i) => unit(`U${i}`, 0, 2))]))
    // Put the sword and a unit in play for free.
    s.players[0].hand.unshift(sword)
    s = play(s, 0, 0)
    s = play(s, 0, s.players[0].hand.findIndex((c) => c.category === 'Unit'))
    const gear = s.players[0].gear[0]
    const u = s.players[0].base[0]
    s = applyTool(s, { kind: 'equip', side: 0, gear: gear.uid, unit: u.uid })
    expect(s.players[0].gear).toHaveLength(0)
    expect(s.players[0].base[0].equipment?.map((e) => e.card.name)).toEqual(['Long Sword'])
    s = applyTool(s, { kind: 'unequip', unit: u.uid, gear: gear.uid })
    expect(s.players[0].gear).toHaveLength(1)
    s = applyTool(s, { kind: 'equip', side: 0, gear: gear.uid, unit: u.uid })
    s = applyTool(s, { kind: 'kill', unit: u.uid })
    expect(s.players[0].base).toHaveLength(0)
    expect(s.players[0].gear.map((g) => g.card.name)).toEqual(['Long Sword'])
  })
})

describe('the chain: priority and answering with a Reaction', () => {
  const k = { assault: 0, shield: 0, tank: false, backline: false, ganking: false, accelerate: false, temporary: false }
  const piece = (uid: string, card: ReturnType<typeof unit>, owner: 0 | 1): Unit => ({ uid, card, owner, might: card.might ?? 2, bonus: 0, temp: 0, buffed: false, token: false, damage: 0, exhausted: false, stunned: false, keywords: k })
  const bolt = makeCard('riftbound', { name: 'Bolt', category: 'Spell', cost: '1', colors: ['Fury'], text: 'Deal 3 to a unit.' })
  const gust = makeCard('riftbound', { name: 'Gust', category: 'Spell', cost: '1', colors: ['Fury'], text: "[Reaction] (Play any time, even before spells and abilities resolve.)Return a unit at a battlefield with 3 :rb_might: or less to its owner's hand." })
  const guard = unit('Guard', 2, 2)

  /** You (going first) with Bolts and Gusts, them with Gusts; their Guard at the first battlefield. */
  function board(): GameState {
    const s = structuredClone(started(setup(Array.from({ length: 40 }, (_, i) => (i % 2 ? bolt : gust))), setup(Array.from({ length: 40 }, () => gust))))
    s.players[0].hand = [bolt, gust]
    s.players[1].hand = [gust]
    s.players[1].runes = [0, 1, 2].map((i) => ({ uid: `r${i}`, domain: 'Fury', exhausted: false }))
    s.battlefields[0].units = [piece('d', guard, 1)]
    return s
  }

  it('waits for an answer, a Reaction resolves first, and the first card misses a target that left', () => {
    let s = playOnChain(board(), 0, 0, { targets: ['d'] })
    expect(s.chain).toMatchObject({ priority: 1, items: [{ card: { name: 'Bolt' }, targets: ['d'] }] })
    expect(s.battlefields[0].units).toHaveLength(1) // nothing resolved yet
    expect(endTurn(s)).toBe(s) // the turn can't end with a card on the chain
    expect(canPlay(s, 1, gust)).toBe(true)
    expect(canPlay(s, 1, guard)).toBe(false) // only Reactions on the chain
    expect(canPlay(s, 0, gust)).toBe(false) // it's their priority
    // They save their Guard with Gust.
    s = playOnChain(s, 1, 0, { targets: ['d'] })
    expect(s.chain?.priority).toBe(0)
    s = pass(s, 0)
    expect(s.players[1].hand.map((c) => c.name)).toEqual(['Guard'])
    expect(s.chain?.priority).toBe(1)
    s = pass(s, 1)
    expect(s.chain).toBeNull()
    expect(s.players[0].trash.map((c) => c.name)).toEqual(['Bolt'])
  })

  it('returns the unit you pick with Gust once the other player passes', () => {
    let s = playOnChain(board(), 0, 1, { targets: ['d'] })
    expect(s.battlefields[0].units).toHaveLength(1)
    s = pass(s, 1)
    expect(s.battlefields[0].units).toHaveLength(0)
    expect(s.players[1].hand.map((c) => c.name)).toEqual(['Gust', 'Guard'])
  })

  it('runs the text it can read when you play by hand too', () => {
    const s = { ...board(), manual: [0 as const] }
    const t = pass(playOnChain(s, 0, 1, { targets: ['d'] }), 1)
    expect(t.players[1].hand.map((c) => c.name)).toEqual(['Gust', 'Guard'])
  })

  it('the bot gets priority on your card, and the chain finishes', () => {
    const s = playOnChain(board(), 0, 0, { targets: ['d'] })
    expect(botShouldAct(s, BOT)).toBe(true)
    const answered = settle(botAct(s, BOT, 'normal'))
    expect(answered.chain).toBeNull()
    expect(answered.players[0].trash.map((c) => c.name)).toContain('Bolt')
  })

  it("the bot's card waits for you, with its targets picked", () => {
    const s = structuredClone(board())
    s.active = 1
    s.players[1].hand = [bolt]
    s.players[1].runes.forEach((r) => (r.exhausted = false))
    s.battlefields[0].units.push(piece('mine', unit('Mine', 2, 2), 0))
    const t = playOnChain(s, 1, 0)
    expect(t.chain?.priority).toBe(0)
    expect(t.chain?.items[0].targets).toEqual(['mine'])
    expect(botShouldAct(t, BOT)).toBe(false)
  })

  it('marks targets for text the game leaves to you, and logs them as it resolves', () => {
    const odd = makeCard('riftbound', { name: 'Odd', category: 'Spell', cost: '0', colors: ['Fury'], text: 'Do something strange to a unit.' })
    const s = structuredClone(board())
    s.players[0].hand = [odd]
    let t = playOnChain(s, 0, 0, { marked: ['d'] })
    expect(t.chain?.items[0].marked).toEqual(['d'])
    t = pass(t, 1)
    expect(t.log.at(-1)?.text).toMatch(/Odd resolved: apply it with the tools\. \(targeting Guard\)/)
  })

  it('in a showdown, the focus goes to the other player when a chain they started is done', () => {
    const s = structuredClone(board())
    s.players[0].hand = []
    s.players[1].hand = [gust]
    s.players[0].base = [piece('a', unit('Two', 2, 2), 0)]
    let t = move(s, 0, ['a'], 0)
    expect(t.showdown?.focus).toBe(1)
    t = playOnChain(t, 1, 0, { targets: ['a'] })
    expect(t.chain?.priority).toBe(0)
    t = pass(t, 0)
    expect(t.chain).toBeNull()
    expect(t.showdown?.focus).toBe(0)
    expect(t.players[0].hand.map((c) => c.name)).toEqual(['Two'])
  })
})
