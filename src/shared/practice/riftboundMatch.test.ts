import { describe, expect, it } from 'vitest'
import { matchWinner, newMatch, nextSeries, openBattlefields, seriesOpen, seriesScore, seriesWinner, swap, swapCounts, swapped, withBattlefields, withResult } from './riftboundMatch'
import { newGame, type DeckSetup, type GameState } from './riftbound'
import { flipState } from './online'
import { makeCard } from '../testFixtures'

const setup = (): DeckSetup => ({ main: Array.from({ length: 40 }, (_, i) => makeCard('riftbound', { name: `U${i}`, category: 'Unit', cost: '1', might: 1 })), champion: null, legend: null, battlefields: [makeCard('riftbound', { name: 'A', category: 'Battlefield' })], runes: Array(12).fill('Fury') })

const deck = {
  zones: { main: [{ cardId: 'a', quantity: 3 }, { cardId: 'b', quantity: 2 }], sideboard: [{ cardId: 'x', quantity: 2 }], legend: [{ cardId: 'L', quantity: 1 }] },
  freeTextZones: {},
}

describe('a best-of-3 match', () => {
  it('is won at two games', () => {
    let m = newMatch(null)
    m = withResult(m, 0)
    expect(matchWinner(m)).toBeNull()
    m = withResult(withResult(m, 1), 1)
    expect(m.wins).toEqual([1, 2])
    expect(matchWinner(m)).toBe(1)
  })

  it('swaps one for one, and swapping back undoes it', () => {
    let s = swap(deck, { out: {}, in: {} }, 'a', 'out')!
    s = swap(deck, s, 'x', 'in')!
    expect(swapCounts(s)).toEqual({ out: 1, in: 1 })
    const d = swapped(deck, s)
    expect(d.zones.main).toEqual([{ cardId: 'a', quantity: 2 }, { cardId: 'b', quantity: 2 }, { cardId: 'x', quantity: 1 }])
    expect(d.zones.sideboard).toEqual([{ cardId: 'x', quantity: 1 }, { cardId: 'a', quantity: 1 }])
    expect(d.zones.legend).toEqual(deck.zones.legend)
    s = swap(deck, s, 'x', 'out')!
    expect(s).toEqual({ out: { a: 1 }, in: {} })
    expect(swap(deck, { out: {}, in: {} }, 'zz', 'in')).toBeNull()
  })

  it("won't offer a battlefield already played, unless every one has been", () => {
    const bfs = [{ id: 'p' }, { id: 'q' }]
    let m = withBattlefields(newMatch(null), 'p', 'r')
    expect(openBattlefields(bfs, m, 0)).toEqual([{ id: 'q' }])
    m = withBattlefields(m, 'q', null)
    expect(openBattlefields(bfs, m, 0)).toEqual(bfs)
  })
})

describe('a best-of-3 online (the match in the game state)', () => {
  const over = (winner: 0 | 1, series?: GameState['series']) => ({ phase: 'over', winner, ...(series ? { series } : {}) }) as unknown as GameState

  it('counts a finished game, and the next game carries the score and the battlefields', () => {
    const s1 = nextSeries({ phase: 'mulligan', winner: null } as unknown as GameState, 'a', 'x')
    expect(s1).toEqual({ bestOf: 3, wins: [0, 0], used: [['a'], ['x']] })
    expect(seriesScore(over(1, s1))).toEqual([0, 1])
    const s2 = nextSeries(over(1, s1), 'b', 'y')
    expect(s2).toEqual({ bestOf: 3, wins: [0, 1], used: [['a', 'b'], ['x', 'y']] })
    expect(seriesWinner(over(1, s2))).toBe(1)
    expect(seriesWinner(over(0, s2))).toBeNull()
    expect(seriesOpen([{ id: 'a' }, { id: 'b' }, { id: 'c' }], over(0, s2))).toEqual([{ id: 'c' }])
  })

  it('flips with the board for the other player', () => {
    const s = { ...newGame(setup(), setup(), { first: 0 }), series: { bestOf: 3 as const, wins: [1, 0] as [number, number], used: [['a'], ['x']] as [string[], string[]] } }
    s.players[0].bfPick = 'b'
    const f = flipState(s)
    expect(f.series).toEqual({ bestOf: 3, wins: [0, 1], used: [['x'], ['a']] })
    expect(f.players[1].bfPick).toBe('b')
    expect(flipState(f).series).toEqual(s.series)
    expect(flipState(f).players[0].bfPick).toBe('b')
  })
})
