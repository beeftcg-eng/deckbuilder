import { describe, expect, it } from 'vitest'
import { checkDeckLegality } from './legality'
import { onepieceAdapter } from './games/onepiece'
import { pokemonAdapter } from './games/pokemon'
import { mtgAdapter } from './games/mtg'
import { catalogOf, makeCard, makeDeck } from './testFixtures'
import type { Card, Format } from './types'

const noBans: Format = { id: 'standard', label: 'Standard', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] }

describe('checkDeckLegality copy limits', () => {
  it('pools Pokémon copies across printings by name', () => {
    const a = makeCard('pokemon', { name: 'Pikachu', sourceId: 'a', legality: { standard: 'legal' } })
    const b = makeCard('pokemon', { name: 'Pikachu', sourceId: 'b', legality: { standard: 'legal' } })
    const deck = makeDeck('pokemon', { main: [[a, 3], [b, 2]] })
    const result = checkDeckLegality(deck, pokemonAdapter, noBans, catalogOf([a, b]))
    expect(result.issues.some((i) => i.message.includes('Pikachu: 5 copies exceeds the 4-copy limit'))).toBe(true)
  })

  it('gives One Piece cards with different numbers their own 4 copies', () => {
    const a = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'OP08-066', colors: ['Red'] })
    const b = makeCard('onepiece', { name: 'Charlotte Brulee', sourceId: 'ST34-003', colors: ['Red'] })
    const leader = makeCard('onepiece', { name: 'Leader', sourceId: 'OP01-001', category: 'Leader', colors: ['Red'] })
    const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[a, 4], [b, 4]] })
    const result = checkDeckLegality(deck, onepieceAdapter, noBans, catalogOf([a, b, leader]))
    expect(result.issues.some((i) => i.message.includes('copies exceeds'))).toBe(false)
  })

  it('flags a banned card even when a different printing of it is in the deck', () => {
    const banned = makeCard('onepiece', { name: 'Banned', sourceId: 'OP06-116', id: 'onepiece:OP06-116_p2', colors: ['Red'] })
    const leader = makeCard('onepiece', { name: 'Leader', sourceId: 'OP01-001', category: 'Leader', colors: ['Red'] })
    const format: Format = { ...noBans, bannedCardIds: ['onepiece:OP06-116'] }
    const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[banned, 1]] })
    const result = checkDeckLegality(deck, onepieceAdapter, format, catalogOf([banned, leader]))
    expect(result.issues.some((i) => i.message.includes('Banned is banned'))).toBe(true)
  })
})

describe('Pokémon basic Energy', () => {
  it('has no copy limit, but other cards still do', () => {
    const energy = makeCard('pokemon', { name: 'Fire Energy', category: 'Energy', subtypes: ['Basic'], legality: { standard: 'legal' } })
    const trainer = makeCard('pokemon', { name: 'Nest Ball', category: 'Trainer', legality: { standard: 'legal' } })
    const deck = makeDeck('pokemon', { main: [[energy, 12], [trainer, 5]] })
    const messages = checkDeckLegality(deck, pokemonAdapter, noBans, catalogOf([energy, trainer])).issues.map((i) => i.message)
    expect(messages.some((m) => m.includes('Fire Energy'))).toBe(false)
    expect(messages).toContain('Nest Ball: 5 copies exceeds the 4-copy limit.')
  })
})

describe('Magic legality', () => {
  const fmt = (id: string): Format => mtgAdapter.defaultFormats.find((f) => f.id === id)!
  const ALL = { standard: 'legal', pioneer: 'legal', modern: 'legal', legacy: 'legal', vintage: 'legal', commander: 'legal', pauper: 'legal' } as const
  let n = 0
  const spell = (over: Partial<Card> = {}): Card => {
    n += 1
    return makeCard('mtg', { name: `Spell ${n}`, category: 'Instant', legality: { ...ALL }, colors: [], colorIdentity: [], ...over })
  }
  const basic = (name: string, color: string): Card =>
    makeCard('mtg', { name, category: 'Land', subtypes: ['Basic'], legality: { ...ALL }, colors: [], colorIdentity: [color] })
  const errors = (deck: ReturnType<typeof makeDeck>, cards: Card[], formatId: string) =>
    checkDeckLegality({ ...deck, formatId }, mtgAdapter, fmt(formatId), catalogOf(cards)).issues.map((i) => i.message)

  // Nine different four-ofs and 24 basics: a legal 60.
  const nonbasics = Array.from({ length: 9 }, () => spell())
  const forest = basic('Forest', 'Green')
  const sixty = (extra: [Card, number][] = []) => makeDeck('mtg', { main: [...nonbasics.map((c): [Card, number] => [c, 4]), [forest, 24], ...extra] })

  describe('60-card formats', () => {
    it('accepts a legal deck', () => {
      expect(errors(sixty(), [...nonbasics, forest], 'standard')).toEqual([])
    })

    it('needs at least 60 cards in the main deck, but has no upper limit', () => {
      const short = makeDeck('mtg', { main: [[forest, 59]] })
      expect(errors(short, [forest], 'modern').join()).toContain('Main Deck must have at least 60 cards (currently 59)')
      const plus = spell()
      expect(errors(sixty([[plus, 1]]), [...nonbasics, forest, plus], 'modern')).toEqual([])
    })

    it('caps the sideboard at 15', () => {
      const side = spell()
      const deck = makeDeck('mtg', { main: sixty().zones.main.map((e) => [catalogOf([...nonbasics, forest]).get(e.cardId)!, e.quantity]), sideboard: [[side, 4], [forest, 12]] })
      expect(errors(deck, [...nonbasics, forest, side], 'legacy')).toContain('Sideboard must have at most 15 cards (currently 16).')
    })

    it('limits nonbasic cards to 4 copies across main deck and sideboard, but not basic lands', () => {
      const bolt = spell({ name: 'Bolt' })
      const deck = makeDeck('mtg', { main: [[bolt, 3], [forest, 57]], sideboard: [[bolt, 2]] })
      expect(errors(deck, [bolt, forest], 'modern')).toContain('Bolt: 5 copies exceeds the 4-copy limit.')
      expect(errors(deck, [bolt, forest], 'modern').some((m) => m.includes('Forest'))).toBe(false)
    })

    it('lets cards whose text lifts the limit run any number, and enforces "up to N" ones', () => {
      const rats = spell({ name: 'Relentless Rats', text: 'A deck can have any number of cards named Relentless Rats.' })
      const dwarves = spell({ name: 'Seven Dwarves', text: 'A deck can have up to seven cards named Seven Dwarves.' })
      const deck = makeDeck('mtg', { main: [[rats, 30], [dwarves, 8], [forest, 22]] })
      const messages = errors(deck, [rats, dwarves, forest], 'modern')
      expect(messages).toContain('Seven Dwarves: 8 copies exceeds the 7-copy limit.')
      expect(messages.some((m) => m.includes('Relentless Rats'))).toBe(false)
    })

    it('names the format when a card is not legal or is banned there', () => {
      const notLegal = spell({ name: 'Old Card', legality: { modern: 'legal' } })
      const banned = spell({ name: 'Bad Card', legality: { standard: 'banned', modern: 'legal' } })
      const deck = makeDeck('mtg', { main: [[notLegal, 1], [banned, 1], [forest, 58]] })
      const messages = errors(deck, [notLegal, banned, forest], 'standard')
      expect(messages).toContain('Old Card is not legal in Standard.')
      expect(messages).toContain('Bad Card is banned in Standard.')
    })

    it('treats a Vintage restricted card as legal in one copy, counting the sideboard', () => {
      const recall = spell({ name: 'Ancestral Recall', legality: { vintage: 'restricted' } })
      const one = makeDeck('mtg', { main: [[recall, 1], [forest, 59]] })
      expect(errors(one, [recall, forest], 'vintage')).toEqual([])
      const two = makeDeck('mtg', { main: [[recall, 1], [forest, 59]], sideboard: [[recall, 1]] })
      expect(errors(two, [recall, forest], 'vintage')).toContain('Ancestral Recall is restricted to 1 copy in Vintage.')
    })

    it('ignores color identity, which only matters in Commander', () => {
      const red = spell({ colorIdentity: ['Red'] })
      const deck = makeDeck('mtg', { main: [[red, 4], [forest, 56]] })
      expect(errors(deck, [red, forest], 'modern')).toEqual([])
    })
  })

  describe('Commander', () => {
    const legend = (name: string, identity: string[]): Card =>
      spell({ name, category: 'Creature', subtypes: ['Legendary', 'Elf'], colors: identity, colorIdentity: identity })
    const atraxa = legend('Atraxa', ['White', 'Blue', 'Black', 'Green'])
    const uniques = Array.from({ length: 60 }, () => spell({ colorIdentity: ['Green'] }))
    const island = basic('Island', 'Blue')
    // Commander + 60 singletons + 39 basics = 100.
    const hundred = (over: { commander?: [Card, number][]; main?: [Card, number][] } = {}) =>
      makeDeck('mtg', { commander: over.commander ?? [[atraxa, 1]], main: over.main ?? [...uniques.map((c): [Card, number] => [c, 1]), [island, 39]] })
    const pool = [atraxa, ...uniques, island, forest]

    it('accepts a 100-card singleton deck inside the commander’s colors', () => {
      expect(errors(hundred(), pool, 'commander')).toEqual([])
    })

    it('requires exactly 100 cards including the commander', () => {
      const short = hundred({ main: [...uniques.map((c): [Card, number] => [c, 1]), [island, 38]] })
      expect(errors(short, pool, 'commander')).toContain('The deck must have exactly 100 cards in total (currently 99).')
    })

    it('is singleton except for basic lands', () => {
      const twice = hundred({ main: [[uniques[0], 2], ...uniques.slice(1).map((c): [Card, number] => [c, 1]), [island, 37]] })
      expect(errors(twice, pool, 'commander')).toContain(`${uniques[0].name}: 2 copies exceeds the 1-copy limit.`)
    })

    it('rejects cards outside the commander’s color identity, but allows colorless ones', () => {
      const red = spell({ name: 'Red Spell', colorIdentity: ['Red'] })
      const rock = spell({ name: 'Rock', colors: [], colorIdentity: [] })
      const deck = hundred({ main: [[red, 1], [rock, 1], ...uniques.slice(2).map((c): [Card, number] => [c, 1]), [island, 38]] })
      const messages = errors(deck, [...pool, red, rock], 'commander')
      expect(messages).toContain("Red Spell (Red) doesn't match your Atraxa colors.")
      expect(messages.some((m) => m.includes('Rock'))).toBe(false)
    })

    it('uses color identity, so a land’s mana abilities count', () => {
      const mountainish = spell({ name: 'Sacred Foundry', category: 'Land', colors: [], colorIdentity: ['Red', 'White'] })
      const deck = hundred({ main: [[mountainish, 1], ...uniques.slice(1).map((c): [Card, number] => [c, 1]), [island, 38]] })
      expect(errors(deck, [...pool, mountainish], 'commander').some((m) => m.includes('Sacred Foundry'))).toBe(true)
    })

    it('only lets a legendary creature (or a card that says so) be the commander', () => {
      const notLegendary = spell({ name: 'Plain Elf', category: 'Creature', colorIdentity: ['Green'] })
      const deck = hundred({ commander: [[notLegendary, 1]] })
      expect(errors(deck, [...pool, notLegendary], 'commander')).toContain('Plain Elf does not belong in Commander.')
    })

    it('allows Partner pairs (two commanders, one 98-card main deck) and unions their colors', () => {
      const red = legend('Partner Red', ['Red'])
      const redInside = spell({ name: 'Red Inside', colorIdentity: ['Red'] })
      const deck = hundred({ commander: [[atraxa, 1], [red, 1]], main: [[redInside, 1], ...uniques.slice(1).map((c): [Card, number] => [c, 1]), [island, 38]] })
      expect(errors(deck, [...pool, red, redInside], 'commander')).toEqual([])
    })

    it('does not allow three commanders', () => {
      const [a, b] = [legend('B', ['Green']), legend('C', ['Green'])]
      const deck = hundred({ commander: [[atraxa, 1], [a, 1], [b, 1]], main: [...uniques.slice(2).map((c): [Card, number] => [c, 1]), [island, 38]] })
      expect(errors(deck, [...pool, a, b], 'commander')).toContain('Commander must have at most 2 cards (currently 3).')
    })

    it('is singleton where the 60-card formats allow four copies', () => {
      // The same 4-of deck is fine in Standard and a singleton violation in Commander.
      const deck = sixty()
      expect(errors(deck, [...nonbasics, forest], 'standard')).toEqual([])
      expect(errors(deck, [...nonbasics, forest], 'commander').some((m) => m.includes('exceeds the 1-copy limit'))).toBe(true)
    })
  })
})
