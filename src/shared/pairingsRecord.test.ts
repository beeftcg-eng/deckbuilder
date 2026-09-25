import { describe, expect, it } from 'vitest'
import { matchupsOf, parseDeckRecords, parseRecord, summarizeRecord } from './pairingsRecord'
import type { PairingsResult } from './types'

function result(overrides: Partial<PairingsResult>): PairingsResult {
  return { event: 'Weekly', date: '2026-09-01', game: 'Riftbound', format: 'Constructed', store: '', placement: '', record: '', inProgress: false, matches: [], deckVersion: null, ...overrides }
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
  it('reads the synced list fingerprint, version and each result\'s deck version (null from an older Pairings)', () => {
    const out = parseDeckRecords({
      decks: [
        { brewhouse_deck_id: 'bh1', synced_hash: 'abc123', version: 3, results: [{ record: '2-0', deck_version: 2 }, { record: '1-1', deck_version: null }] },
        { brewhouse_deck_id: 'bh2', synced_hash: '', version: 'x', results: [] },
        { brewhouse_deck_id: 'bh3', results: [{ record: '1-0', deck_version: -1 }] },
      ],
    })
    expect(out.map((d) => [d.brewhouseDeckId, d.syncedHash, d.version])).toEqual([
      ['bh1', 'abc123', 3],
      ['bh2', null, null],
      ['bh3', null, null],
    ])
    expect(out[0].results.map((r) => r.deckVersion)).toEqual([2, null])
    expect(out[2].results[0].deckVersion).toBeNull()
  })
})

describe('matchups', () => {
  const m = (opponent: string, outcome: 'W' | 'L' | 'D' | '') => ({ opponent, outcome })
  const results = [
    result({ matches: [m('Jinx', 'W'), m('Viktor', 'L'), m('jinx ', 'W'), m('', 'W'), m('Ahri', '')] }),
    result({ matches: [m('Viktor', 'L'), m('Jinx', 'L'), m('Viktor', 'W'), m('Lux', 'W'), m('Ekko', 'D')] }),
  ]

  it('groups opponents ignoring case and spaces, and skips blank names or outcomes', () => {
    expect(matchupsOf(results)).toEqual([
      { opponent: 'Jinx', wins: 2, losses: 1, draws: 0, games: 3 },
      { opponent: 'Viktor', wins: 1, losses: 2, draws: 0, games: 3 },
      { opponent: 'Ekko', wins: 0, losses: 0, draws: 1, games: 1 },
      { opponent: 'Lux', wins: 1, losses: 0, draws: 0, games: 1 },
    ])
  })

  it('ranks best and toughest only among opponents faced at least twice', () => {
    const s = summarizeRecord(results)
    expect(s.bestAgainst.map((x) => x.opponent)).toEqual(['Jinx', 'Viktor'])
    expect(s.toughestAgainst.map((x) => x.opponent)).toEqual(['Viktor', 'Jinx'])
  })

  it('is empty when no matches were logged', () => {
    expect(summarizeRecord([result({ record: '3-0' })])).toMatchObject({ matchups: [], bestAgainst: [], toughestAgainst: [] })
  })
})
