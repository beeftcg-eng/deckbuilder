import { describe, expect, it } from 'vitest'
import { parseDeckRecords, parseRecord, summarizeRecord } from './pairingsRecord'
import type { PairingsResult } from './types'

function result(overrides: Partial<PairingsResult>): PairingsResult {
  return { event: 'Weekly', date: '2026-09-01', game: 'Riftbound', format: 'Constructed', store: '', placement: '', record: '', inProgress: false, matches: [], ...overrides }
}

describe('parseRecord', () => {
  it('reads w-l and w-l-d the way Pairings does', () => {
    expect(parseRecord('3-1')).toEqual({ w: 3, l: 1, d: 0 })
    expect(parseRecord(' 2 - 2 - 1 ')).toEqual({ w: 2, l: 2, d: 1 })
    expect(parseRecord('went 4-0!')).toEqual({ w: 4, l: 0, d: 0 })
    expect(parseRecord('')).toBeNull()
    expect(parseRecord('won')).toBeNull()
  })
})

describe('summarizeRecord', () => {
  it('adds records up, leaves draws out of the win rate, and sorts newest first', () => {
    const s = summarizeRecord([
      result({ date: '2026-08-01', record: '3-1' }),
      result({ date: '2026-09-10', record: '1-2-1' }),
      result({ date: '2026-09-05', record: '' }),
    ])
    expect(s).toMatchObject({ wins: 4, losses: 3, draws: 1, winRate: 57, events: 3 })
    expect(s.results.map((r) => r.date)).toEqual(['2026-09-10', '2026-09-05', '2026-08-01'])
  })
  it('has no win rate before a decided game', () => {
    expect(summarizeRecord([]).winRate).toBeNull()
    expect(summarizeRecord([result({ record: '0-0-2' })]).winRate).toBeNull()
  })
})

describe('parseDeckRecords', () => {
  it('maps the RPC rows and tolerates junk', () => {
    const raw = {
      decks: [
        {
          brewhouse_deck_id: 'bh1',
          results: [
            { event: 'Store champs', date: '2026-09-01', record: '4-1', in_progress: false, placement: 2, matches: [{ opponent: 'Jinx', outcome: 'W' }, { opponent: 'Viktor', outcome: 'X' }] },
            null,
          ],
        },
        { results: [] },
        'nonsense',
      ],
    }
    const out = parseDeckRecords(raw)
    expect(out).toHaveLength(1)
    expect(out[0].brewhouseDeckId).toBe('bh1')
    expect(out[0].results[0]).toMatchObject({ event: 'Store champs', placement: '2', record: '4-1', inProgress: false })
    expect(out[0].results[0].matches).toEqual([{ opponent: 'Jinx', outcome: 'W' }, { opponent: 'Viktor', outcome: '' }])
    expect(out[0].results[1]).toMatchObject({ event: '', record: '' })
    expect(parseDeckRecords(null)).toEqual([])
    expect(parseDeckRecords({ decks: 'x' })).toEqual([])
  })
})
