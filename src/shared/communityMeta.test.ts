import { describe, expect, it } from 'vitest'
import { cardPlayRates, coreDeck, legendMeta, listOwnership } from './communityMeta'
import type { CommunityList } from './communityLists'
import { makeCard } from './testFixtures'

const list = (legendId: string, rank: number): CommunityList => ({
  id: `${legendId}${rank}`,
  legendId,
  legendName: legendId,
  eventName: 'e',
  date: null,
  players: null,
  rank,
  player: null,
  deckCode: '',
})

const legend = makeCard('riftbound', { name: 'Teemo - Swift Scout', category: 'Legend' })
const gust = makeCard('riftbound', { name: 'Gust', price: 1 })
const gustAlt = makeCard('riftbound', { name: 'Gust (Alternate Art)', price: 5 })
const retreat = makeCard('riftbound', { name: 'Retreat', price: 2 })
const plaza = makeCard('riftbound', { name: 'The Grand Plaza', category: 'Battlefield' })
const cards = [legend, gust, gustAlt, retreat, plaza]
const cardsById = new Map(cards.map((c) => [c.id, c]))
const deck = (main: [string, number][], runes: [string, number][], battlefields: string[] = []) => ({
  zones: {
    legend: [{ cardId: legend.id, quantity: 1 }],
    main: main.map(([cardId, quantity]) => ({ cardId, quantity })),
    battlefields: battlefields.map((cardId) => ({ cardId, quantity: 1 })),
  },
  freeTextZones: { runes: runes.map(([label, quantity]) => ({ label, quantity })) },
})

describe('community meta', () => {
  it('counts each Legend’s lists, wins and top 4s', () => {
    expect(legendMeta([list('A', 1), list('B', 2), list('A', 5), list('A', 3)])).toEqual([
      { legendId: 'A', legendName: 'A', lists: 3, wins: 1, top4: 2 },
      { legendId: 'B', legendName: 'B', lists: 1, wins: 0, top4: 1 },
    ])
  })

  const decks = [
    deck([[gust.id, 2], [gustAlt.id, 1], [retreat.id, 1]], [['Mind', 8], ['Chaos', 4]], [plaza.id]),
    deck([[gust.id, 3]], [['Mind', 6], ['Chaos', 6]], [plaza.id]),
    deck([[gust.id, 3], [retreat.id, 2]], [['Mind', 7], ['Chaos', 5]]),
  ]

  it('says how many lists play each card, every printing together', () => {
    const plays = cardPlayRates(decks, cardsById)
    expect(plays.map((p) => [p.zoneId, p.card.name, p.lists, p.usualCopies])).toEqual([
      ['main', 'Gust', 3, 3],
      ['main', 'Retreat', 2, 2],
      ['battlefields', 'The Grand Plaza', 2, 1],
    ])
  })

  it('builds the core: cards in half the lists or more, runes split to the usual total', () => {
    const core = coreDeck(decks, cardsById)
    expect(core.zones).toEqual({
      legend: [{ cardId: legend.id, quantity: 1 }],
      main: [
        { cardId: gust.id, quantity: 3 },
        { cardId: retreat.id, quantity: 2 },
      ],
      battlefields: [{ cardId: plaza.id, quantity: 1 }],
    })
    expect(core.freeTextZones.runes).toEqual([
      { label: 'Mind', quantity: 7 },
      { label: 'Chaos', quantity: 5 },
    ])
  })

  it('says how much of a list you own and what the rest costs', () => {
    const owned = new Map([[`riftbound:${'gust'}`, 0]])
    const o = listOwnership(decks[2], cardsById, cards, owned)
    expect(o.needed).toBe(6)
    expect(o.owned).toBeLessThan(6)
    expect(o.missingCost).toBeGreaterThan(0)
  })
})
