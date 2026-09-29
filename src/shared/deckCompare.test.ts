import { describe, expect, it } from 'vitest'
import { catalogOf, makeCard } from './testFixtures'
import { compareDecks, diffText } from './deckCompare'
import type { DeckRules } from './types'

const rules = {
  defaultMaxCopiesPerCard: 4,
  zones: [
    { id: 'main', label: 'Main Deck' },
    { id: 'side', label: 'Sideboard' },
    { id: 'runes', label: 'Rune Deck', freeText: true },
  ],
} as unknown as DeckRules

const bolt = makeCard('mtg', { name: 'Lightning Bolt', sourceId: 'bolt-a' })
const boltArt = makeCard('mtg', { name: 'Lightning Bolt', sourceId: 'bolt-b' })
const shock = makeCard('mtg', { name: 'Shock' })
const guide = makeCard('mtg', { name: 'Goblin Guide' })
const cards = catalogOf([bolt, boltArt, shock, guide])

const deck = (main: [typeof bolt, number][], side: [typeof bolt, number][] = [], runes: { label: string; quantity: number }[] = []) => ({
  zones: { main: main.map(([c, quantity]) => ({ cardId: c.id, quantity })), side: side.map(([c, quantity]) => ({ cardId: c.id, quantity })) },
  freeTextZones: { runes },
})

describe('compareDecks', () => {
  it('lists what to add and take out, zone by zone', () => {
    const a = deck([[bolt, 4], [shock, 4]], [[guide, 2]])
    const b = deck([[bolt, 4], [shock, 2], [guide, 2]], [])
    const diff = compareDecks(a, b, rules, cards)
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(4)
    expect(diff.zones.map((z) => [z.zoneId, z.changes.map((c) => `${c.name} ${c.from}->${c.to}`)])).toEqual([
      ['main', ['Goblin Guide 0->2', 'Shock 4->2']],
      ['side', ['Goblin Guide 2->0']],
    ])
    expect(diffText(diff)).toBe('Main Deck\n+2 Goblin Guide\n−2 Shock\n\nSideboard\n−2 Goblin Guide')
  })

  it("doesn't count another art of the same card as a change", () => {
    const diff = compareDecks(deck([[bolt, 4]]), deck([[bolt, 2], [boltArt, 2]]), rules, cards)
    expect(diff.added + diff.removed).toBe(0)
  })

  it('compares free-text zones (runes) by label', () => {
    const diff = compareDecks(deck([], [], [{ label: 'Fury', quantity: 6 }]), deck([], [], [{ label: 'Fury', quantity: 4 }, { label: 'Calm', quantity: 2 }]), rules, cards)
    expect(diff.zones[0].changes.map((c) => `${c.name} ${c.from}->${c.to}`)).toEqual(['Calm 0->2', 'Fury 6->4'])
  })
})
