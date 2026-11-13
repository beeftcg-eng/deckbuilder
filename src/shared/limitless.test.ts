import { describe, expect, it } from 'vitest'
import { collectLimitlessLists, eventLists } from './limitless'
import { archetypeOf, communityGame, listGame } from './communityGames'
import { listDeck } from './communityMeta'
import { readCommunityListsFile } from './communityLists'
import { parseDecklistText } from './importDeck'
import { getAdapter } from './games/registry'
import { makeCard } from './testFixtures'
import type { Card } from './types'

const event = { id: 'ev1', name: 'Weekly #12', date: '2026-11-10T19:00:00.000Z', format: 'STANDARD', players: 64 }

const opStanding = (placing: number, leader = { name: 'Nico Robin', set: 'EB05', number: '010' }) => ({
  name: `Player ${placing}`,
  player: `p${placing}`,
  placing,
  deck: { id: `${leader.set}-${leader.number}`, name: leader.name },
  decklist: {
    leader,
    character: [
      { count: 4, name: 'Nami', set: 'EB05', number: '055' },
      { count: 4, name: 'Baby 5', set: 'OP12', number: '112' },
    ],
    event: [{ count: 2, name: 'Gum-Gum', set: 'OP01', number: '029' }],
  },
})

const opCards: Card[] = [
  makeCard('onepiece', { name: 'Nico Robin', sourceId: 'EB05-010', category: 'Leader', colors: ['Purple'] }),
  { ...makeCard('onepiece', { name: 'Nico Robin', sourceId: 'EB05-010', category: 'Leader' }), id: 'onepiece:EB05-010_p1' },
  makeCard('onepiece', { name: 'Nami', sourceId: 'EB05-055', category: 'Character' }),
  makeCard('onepiece', { name: 'Baby 5', sourceId: 'OP12-112', category: 'Character' }),
  makeCard('onepiece', { name: 'Gum-Gum', sourceId: 'OP01-029', category: 'Event' }),
]

describe('Limitless lists', () => {
  it('reads One Piece standings: Leader, cards by zone, top finishes only', () => {
    const lists = eventLists('onepiece', event, [opStanding(1), opStanding(2), opStanding(40)])
    expect(lists).toHaveLength(2)
    const [first] = lists
    expect(first).toMatchObject({ gameId: 'onepiece', legendId: 'EB05-010', legendName: 'Nico Robin · EB05-010', rank: 1, player: 'Player 1', eventName: 'Weekly #12', art: { set: 'EB05', number: '010' } })
    expect(first.cards).toContainEqual({ zone: 'leader', count: 1, name: 'Nico Robin', set: 'EB05', number: '010' })
    expect(first.cards).toContainEqual({ zone: 'main', count: 2, name: 'Gum-Gum', set: 'OP01', number: '029' })
  })

  it('pictures a Pokémon archetype by its main attacker, Mega ones included', () => {
    const [list] = eventLists('pokemon', event, [
      {
        name: 'A',
        placing: 1,
        deck: { id: 'mega-rayquaza-ex', name: 'Mega Rayquaza', icons: ['rayquaza-mega'] },
        decklist: { pokemon: [{ count: 2, name: 'Latias ex', set: 'SSP', number: '76' }, { count: 3, name: 'Mega Rayquaza ex', set: 'MEG', number: '50' }], trainer: [], energy: [] },
      },
    ])
    expect(list.legendId).toBe('mega-rayquaza-ex')
    expect(list.art).toEqual({ set: 'MEG', number: '50' })
  })

  it('collects the newest Standard events with enough players, skipping one that fails', async () => {
    const calls: string[] = []
    const getJson = async (path: string) => {
      calls.push(path)
      if (path.startsWith('/tournaments?')) {
        return [
          { ...event, id: 'old', date: '2020-01-01T00:00:00.000Z' },
          { ...event, id: 'small', players: 8 },
          { ...event, id: 'extra', format: 'EXTRA' },
          { ...event, id: 'broken' },
          { ...event, id: 'good', format: null },
        ]
      }
      if (path.includes('broken')) throw new Error('HTTP 500')
      return [opStanding(1)]
    }
    const file = await collectLimitlessLists('onepiece', getJson)
    expect(file.lists.map((l) => l.eventId)).toEqual(['good'])
    expect(calls.filter((c) => c.includes('/standings'))).toEqual(['/tournaments/broken/standings', '/tournaments/good/standings'])
    // The file the apps read keeps them.
    expect(readCommunityListsFile(JSON.parse(JSON.stringify(file)))?.lists).toHaveLength(1)
  })
})

describe('community games', () => {
  const [list] = eventLists('onepiece', event, [opStanding(1)])
  const game = communityGame('onepiece')
  const index = game.index(opCards)
  const byId = new Map(opCards.map((c) => [c.id, c]))

  it('turns a One Piece list into a deck, with the plainest printing of each card', () => {
    expect(listGame(list)).toBe('onepiece')
    const deck = listDeck(list, index)!
    expect(deck.zones.leader).toEqual([{ cardId: 'onepiece:EB05-010', quantity: 1 }])
    expect(deck.zones.main.reduce((n, e) => n + e.quantity, 0)).toBe(10)
    expect(game.artCard(index, list)?.id).toBe('onepiece:EB05-010')
  })

  it('writes text the One Piece importer reads back', () => {
    const text = game.toText(list, byId, index)
    const parsed = parseDecklistText(text, getAdapter('onepiece'), byId)
    expect(parsed.unmatched).toEqual([])
    expect(parsed.matchedCopies).toBe(11)
  })

  it("can't read a list whose cards aren't in the card data yet", () => {
    const [newer] = eventLists('onepiece', event, [{ ...opStanding(1), decklist: { leader: { name: 'X', set: 'OP18', number: '001' }, character: [{ count: 4, name: 'Y', set: 'OP18', number: '002' }, { count: 4, name: 'Z', set: 'OP18', number: '003' }] } }])
    expect(listDeck(newer, index)).toBeNull()
  })

  it("finds a deck's lists by its Leader", () => {
    const mine = { zones: { leader: [{ cardId: 'onepiece:EB05-010_p1', quantity: 1 }], main: [] }, freeTextZones: {} }
    expect(archetypeOf(game, mine, byId, [list], index)).toBe('EB05-010')
  })

  it('finds a Pokémon deck’s archetype by the cards it shares', () => {
    const pk = (name: string, set: string, number: string) => makeCard('pokemon', { name, setCode: set, number, legality: { standard: 'legal' } })
    const cards = [pk('Crustle', 'DRI', '12'), pk('Dwebble', 'DRI', '11'), pk('Dragapult ex', 'TWM', '130'), pk('Dreepy', 'TWM', '128')]
    const pIndex = communityGame('pokemon').index(cards)
    const pById = new Map(cards.map((c) => [c.id, c]))
    const lists = eventLists('pokemon', event, [
      { name: 'a', placing: 1, deck: { id: 'crustle-dri', name: 'Crustle', icons: ['crustle'] }, decklist: { pokemon: [{ count: 4, name: 'Crustle', set: 'DRI', number: '12' }, { count: 4, name: 'Dwebble', set: 'DRI', number: '11' }] } },
      { name: 'b', placing: 2, deck: { id: 'dragapult', name: 'Dragapult', icons: ['dragapult'] }, decklist: { pokemon: [{ count: 3, name: 'Dragapult ex', set: 'TWM', number: '130' }, { count: 4, name: 'Dreepy', set: 'TWM', number: '128' }] } },
    ])
    const crustleish = { zones: { main: [{ cardId: cards[0].id, quantity: 3 }, { cardId: cards[1].id, quantity: 3 }, { cardId: cards[3].id, quantity: 1 }] }, freeTextZones: {} }
    expect(archetypeOf(communityGame('pokemon'), crustleish, pById, lists, pIndex)).toBe('crustle-dri')
    // The text the import window gets reads back as the same cards.
    const text = communityGame('pokemon').toText(lists[0], pById, pIndex)
    const parsed = parseDecklistText(text, getAdapter('pokemon'), pById)
    expect(parsed.unmatched).toEqual([])
    expect(parsed.matchedCopies).toBe(8)
    // Nothing in common: no archetype.
    expect(archetypeOf(communityGame('pokemon'), { zones: { main: [] }, freeTextZones: {} }, pById, lists, pIndex)).toBeNull()
  })
})
