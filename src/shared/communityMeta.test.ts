import { describe, expect, it } from 'vitest'
import { cardPlayRates, cardTrends, localMeta, checkListWatches, compareToMeta, coreDeck, legendMeta, listOwnership, newListsFor, recordsVsLegends, sanitizeListAlerts, sanitizeListWatches, tradeOffersFor } from './communityMeta'
import { codeIndex } from './riftboundDeckCode'
import type { PairingsResult } from './types'
import type { CommunityList } from './communityLists'
import { makeCard } from './testFixtures'

const list = (legendId: string, rank: number): CommunityList => ({
  id: `${legendId}${rank}`,
  eventId: 'e',
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

  it('counts your Pairings results against each Legend, by its champion', () => {
    const result = (...matches: [string, 'W' | 'L' | 'D'][]): PairingsResult => ({
      event: '', date: '', game: '', format: '', store: '', placement: '', record: '', inProgress: false, deckVersion: null,
      matches: matches.map(([opponent, outcome]) => ({ opponent, outcome, wentFirst: '' })),
    })
    const legends = [
      { legendId: 'K', legendName: 'Kennen, Heart of the Tempest' },
      { legendId: 'Y1', legendName: 'Master Yi, Wuju Bladesman' },
      { legendId: 'Y2', legendName: 'Master Yi, Wuju Master' },
    ]
    const records = recordsVsLegends(legends, [result(['kennen', 'L'], ['Kennen OC', 'W'], ['Master Yi bladesman', 'W'], ['master yi', 'L'], ['Kennenite', 'W'])])
    expect(records.get('K')).toEqual({ wins: 1, losses: 1, draws: 0 })
    expect(records.get('Y1')).toEqual({ wins: 1, losses: 0, draws: 0 })
    expect(records.has('Y2')).toBe(false)
  })

  it("watches a list's cost to finish, once until it climbs back", () => {
    const kennen = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', sourceId: 'ven-155-166', category: 'Legend', price: 2 })
    const sett = makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006', price: 4 })
    const all = [kennen, sett]
    const byId = new Map(all.map((c) => [c.id, c]))
    const watches = sanitizeListWatches({ a: { name: 'Kennen', deckCode: 'CUAQEAYBAECQAAQBAEAQCBIAACNQCAAA', target: 10 }, bad: { name: 'x', deckCode: 'lower', target: 1 } })
    expect(Object.keys(watches)).toEqual(['a'])
    const first = checkListWatches(watches, codeIndex(all), byId, all, new Map())
    expect(first.hits).toEqual([])
    const owned = new Map([[`riftbound:${sett.name.toLowerCase()}`, 2]])
    const second = checkListWatches(watches, codeIndex(all), byId, all, owned)
    expect(second.hits.map((h) => h.cost)).toEqual([6])
    expect(second.next?.a.hit).toBe(true)
    expect(checkListWatches(second.next!, codeIndex(all), byId, all, owned).next).toBeNull()
    expect(checkListWatches(second.next!, codeIndex(all), byId, all, new Map()).next?.a.hit).toBeUndefined()
  })

  it("finds the missing cards on other people's trade lists", () => {
    const traders = [
      { userId: '1', displayName: 'Sam', email: '', wants: [], collection: [{ gameId: 'riftbound' as const, cardId: 'x', cardName: 'Gust (Alternate Art)', setCode: '', quantity: 1, forTrade: true }] },
      { userId: '2', displayName: 'Alex', email: '', wants: [], collection: [{ gameId: 'riftbound' as const, cardId: 'y', cardName: 'Retreat', setCode: '', quantity: 2, forTrade: false }] },
    ]
    const { offers, missingCards } = tradeOffersFor(decks[2], cardsById, new Map(), traders)
    expect(missingCards).toBe(3)
    expect(offers.map((o) => [o.card.name, o.missing, o.traders])).toEqual([['Gust', 3, ['Sam']]])
  })

  it('compares a deck with its Legend’s lists: staples it skips, picks few make', () => {
    const odd = makeCard('riftbound', { name: 'Odd Pick' })
    const mine = deck([[retreat.id, 2], [odd.id, 1]], [])
    const byIdPlus = new Map([...cardsById, [odd.id, odd]])
    const c = compareToMeta(mine, decks, byIdPlus)
    expect(c.total).toBe(3)
    expect(c.missing.map((p) => p.card.name)).toEqual(['Gust', 'The Grand Plaza'])
    expect(c.unusual).toEqual([{ card: odd, lists: 0 }])
  })

  it('finds the cards gaining and losing play over the last two weeks', () => {
    const dated = (date: string, main: [string, number][], i: number) => ({ ...deck(main, []), list: { ...list('A', i), id: `${date}${i}`, date } })
    const older = Array.from({ length: 5 }, (_, i) => dated('2026-09-01', [[gust.id, 3]], i))
    const newer = Array.from({ length: 5 }, (_, i) => dated('2026-10-10', [[retreat.id, 3], ...(i < 4 ? [[gust.id, 3] as [string, number]] : [])], i))
    const trends = cardTrends([...newer, ...older], cardsById)!
    expect(trends.rising.map((tr) => [tr.card.name, tr.recent, tr.earlier])).toEqual([['Retreat', 1, 0]])
    expect(trends.falling.map((tr) => [tr.card.name, tr.recent, tr.earlier])).toEqual([['Gust', 0.8, 1]])
    expect(cardTrends(newer, cardsById)).toBeNull()
  })

  it('announces new lists only for the Legends you opted into, each event once', () => {
    const l = (legendId: string, eventId: string): CommunityList => ({ ...list(legendId, 1), id: `${legendId}${eventId}`, eventId, eventName: eventId })
    expect(newListsFor(undefined, [l('K', 'e1')])).toEqual({ found: [], next: null })
    const alerts = sanitizeListAlerts({ legends: ['K', 3], seenEvents: ['e1'] })!
    expect(alerts).toEqual({ legends: ['K'], seenEvents: ['e1'] })
    const { found, next } = newListsFor(alerts, [l('K', 'e1'), l('K', 'e2'), l('K', 'e2'), l('Z', 'e2'), l('K', 'e3')])
    expect(found).toEqual([{ legendId: 'K', legendName: 'K', count: 3, eventNames: ['e2', 'e3'] }])
    expect(next).toEqual({ legends: ['K'], seenEvents: ['e1', 'e2', 'e3'] })
    expect(newListsFor(next!, [l('K', 'e2')]).found).toEqual([])
  })

  it('groups the opponents you faced by Legend, and keeps the rest by name', () => {
    const result = (...matches: [string, 'W' | 'L' | 'D'][]): PairingsResult => ({
      event: '', date: '', game: '', format: '', store: '', placement: '', record: '', inProgress: false, deckVersion: null,
      matches: matches.map(([opponent, outcome]) => ({ opponent, outcome, wentFirst: '' })),
    })
    const legends = [{ legendId: 'K', legendName: 'Kennen, Heart of the Tempest' }, { legendId: 'J', legendName: 'Jinx, Loose Cannon' }]
    const local = localMeta(legends, [result(['kennen', 'L'], ['Kennen OC', 'W'], ['Jinx', 'W'], ['some guy', 'D'])])
    expect(local.games).toBe(4)
    expect(local.legends).toEqual([
      { legendId: 'K', legendName: 'Kennen, Heart of the Tempest', games: 2, wins: 1, losses: 1, draws: 0 },
      { legendId: 'J', legendName: 'Jinx, Loose Cannon', games: 1, wins: 1, losses: 0, draws: 0 },
    ])
    expect(local.other.map((m) => m.opponent)).toEqual(['some guy'])
  })
})
