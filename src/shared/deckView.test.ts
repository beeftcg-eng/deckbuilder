import { describe, expect, it } from 'vitest'
import { buildDeckView, compareByCostThenName, isDeckViewMode, textBlocks } from './deckView'
import { mtgAdapter } from './games/mtg'
import { riftboundAdapter } from './games/riftbound'
import { rulesForFormat } from './games/rules'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

const mtg = (name: string, category: string, cost: string | null) => makeCard('mtg', { name, category, cost })

describe('compareByCostThenName', () => {
  it('orders by cost, then name, with cost-less cards last', () => {
    const cards = [mtg('Zap', 'Instant', '1'), mtg('Forest', 'Land', null), mtg('Ape', 'Creature', '3'), mtg('Bolt', 'Instant', '1'), mtg('X Spell', 'Sorcery', '0')]
    expect(cards.sort(compareByCostThenName).map((c) => c.name)).toEqual(['X Spell', 'Bolt', 'Zap', 'Ape', 'Forest'])
  })
})

describe('buildDeckView', () => {
  const bolt = mtg('Bolt', 'Instant', '1')
  const elf = mtg('Elf', 'Creature', '1')
  const ogre = mtg('Ogre', 'Creature', '3')
  const forest = mtg('Forest', 'Land', null)
  const sideCard = mtg('Negate', 'Instant', '2')
  const cardsById = catalogOf([bolt, elf, ogre, forest, sideCard])
  const rules = rulesForFormat(mtgAdapter, 'modern')

  it('lists non-empty zones in the game’s zone order, split by type alphabetically and sorted by cost', () => {
    const deck = makeDeck('mtg', { sideboard: [[sideCard, 2]], main: [[ogre, 2], [forest, 20], [bolt, 4], [elf, 3]] })
    const sections = buildDeckView(deck, rules, cardsById)
    expect(sections.map((s) => [s.zoneId, s.count])).toEqual([['main', 29], ['sideboard', 2]])
    expect(sections[0].groups.map((g) => [g.category, g.count])).toEqual([['Creature', 5], ['Instant', 4], ['Land', 20]])
    expect(sections[0].groups[0].entries.map((e) => e.card.name)).toEqual(['Elf', 'Ogre'])
  })

  it('leaves out empty zones, zero quantities, and cards missing from the catalog', () => {
    const ghost = mtg('Ghost', 'Creature', '1') // not in the catalog
    const deck = makeDeck('mtg', { main: [[bolt, 1], [ghost, 3], [elf, 0]], sideboard: [] })
    const sections = buildDeckView(deck, rules, cardsById)
    expect(sections).toHaveLength(1)
    expect(sections[0].count).toBe(1)
    expect(sections[0].groups.flatMap((g) => g.entries.map((e) => e.card.name))).toEqual(['Bolt'])
  })

  it('shows a game’s free-text zone (Riftbound runes) as labelled counts', () => {
    const deck = makeDeck('riftbound', {}, { runes: [{ label: 'Fury', quantity: 7 }, { label: 'Calm', quantity: 0 }, { label: 'Order', quantity: 5 }] })
    const sections = buildDeckView(deck, riftboundAdapter.deckRules, catalogOf([]))
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ zoneId: 'runes', count: 12, groups: [], chips: [{ label: 'Fury', quantity: 7 }, { label: 'Order', quantity: 5 }] })
  })

  it('is empty for an empty deck, and does not mutate the deck', () => {
    expect(buildDeckView(makeDeck('mtg', {}), rules, cardsById)).toEqual([])
    const deck = makeDeck('mtg', { main: [[ogre, 1], [elf, 1]] })
    const before = structuredClone(deck)
    buildDeckView(deck, rules, cardsById)
    expect(deck).toEqual(before)
  })
})

describe('textBlocks', () => {
  it('splits a decklist at blank lines so each section stays together', () => {
    expect(textBlocks('Commander\n1 A\n\nDeck\n2 B\n3 C\n\n\nSideboard\n1 D\n')).toEqual(['Commander\n1 A', 'Deck\n2 B\n3 C', 'Sideboard\n1 D'])
    expect(textBlocks('')).toEqual([])
  })
})

describe('isDeckViewMode', () => {
  it('accepts only the three modes', () => {
    expect(['grid', 'list', 'text'].every(isDeckViewMode)).toBe(true)
    expect([undefined, null, 'table', 'GRID', 3].some(isDeckViewMode)).toBe(false)
  })
})
