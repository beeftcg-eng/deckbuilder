import { describe, expect, it } from 'vitest'
import { freshTradeMatches } from './tradeAlerts'
import type { TradeMatch } from './types'

const match = (userId: string, have: string[], want: string[] = []): TradeMatch => ({
  userId,
  displayName: userId.toUpperCase(),
  email: '',
  theyHaveWhatIWant: have.map((cardName) => ({ gameId: 'riftbound', cardName })),
  iHaveWhatTheyWant: want.map((cardName) => ({ gameId: 'riftbound', cardName })),
  mutual: have.length > 0 && want.length > 0,
})

describe('freshTradeMatches', () => {
  it('announces nothing the first time, only remembers', () => {
    const first = freshTradeMatches([match('a', ['Jinx'])], undefined)
    expect(first.fresh).toEqual([])
    expect(first.seen).toEqual(['a|have|riftbound|Jinx'])
  })

  it('announces each new card once, per person', () => {
    const seen = ['a|have|riftbound|Jinx']
    const second = freshTradeMatches([match('a', ['Jinx', 'Vi'], ['Garen']), match('b', ['Jinx'])], seen)
    expect(second.fresh).toEqual([
      { displayName: 'A', have: ['Vi'], want: ['Garen'] },
      { displayName: 'B', have: ['Jinx'], want: [] },
    ])
    expect(freshTradeMatches([match('a', ['Jinx', 'Vi'], ['Garen']), match('b', ['Jinx'])], second.seen).fresh).toEqual([])
  })
})
