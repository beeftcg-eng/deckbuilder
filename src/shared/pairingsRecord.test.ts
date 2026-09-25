import { describe, expect, it } from 'vitest'
import { deckStatsFor, deckVersionsOf, matchupsOf, parseDeckRecords, parseRecord, resultVersion, summarizeRecord } from './pairingsRecord'
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
    expect(out[0].results[0].matches).toEqual([
      { opponent: 'Jinx', outcome: 'W', wentFirst: '' },
      { opponent: 'Viktor', outcome: '', wentFirst: '' },
    ])
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
  const m = (opponent: string, outcome: 'W' | 'L' | 'D' | '') => ({ opponent, outcome, wentFirst: '' as const })
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

describe('deckStatsFor', () => {
  const m = (opponent: string, outcome: 'W' | 'L' | 'D' | '', wentFirst: 'yes' | 'no' | '' = '') => ({ opponent, outcome, wentFirst })
  const versions = [
    { n: 1, from: '', cardCount: null, note: '' },
    { n: 2, from: '2026-09-10', cardCount: 51, note: 'more removal' },
  ]
  const results = [
    result({ date: '2026-08-01', record: '2-1', matches: [m('Jinx', 'W', 'yes'), m('Viktor', 'L', 'no'), m('Jinx', 'W', 'no')] }),
    result({ date: '2026-09-12', record: '1-1-1', deckVersion: 2, matches: [m('Viktor', 'L', 'yes'), m('Ahri', 'W'), m('Ahri', 'D', 'no')] }),
    // Stamped with a version the deck doesn't have: filed by its date instead, like Pairings does.
    result({ date: '2026-09-15', record: '1-0', deckVersion: 7, matches: [m('Jinx', 'W', 'yes')] }),
  ]

  it('adds up the record, turn order and opponents the way Pairings does', () => {
    const s = deckStatsFor(results, versions)
    expect(s.record).toEqual({ wins: 4, losses: 2, draws: 1, games: 7, winRate: 67 })
    expect(s.goingFirst).toEqual({ wins: 2, losses: 1, draws: 0, games: 3, winRate: 67 })
    expect(s.goingSecond).toEqual({ wins: 1, losses: 1, draws: 1, games: 3, winRate: 50 })
    expect(s.opponents.map((o) => [o.opponent, o.games])).toEqual([['Jinx', 3], ['Ahri', 2], ['Viktor', 2]])
    expect(s.best.map((o) => o.opponent)).toEqual(['Jinx', 'Ahri'])
    expect(s.toughest.map((o) => o.opponent)).toEqual(['Viktor'])
    expect(s.results.map((r) => r.date)).toEqual(['2026-09-15', '2026-09-12', '2026-08-01'])
  })

  it('splits by version: stamped results by their stamp, the rest by date', () => {
    expect(resultVersion(results[0], versions)).toBe(1)
    expect(resultVersion(results[1], versions)).toBe(2)
    expect(resultVersion(results[2], versions)).toBe(2)
    expect(deckStatsFor(results, versions, 1).record).toMatchObject({ wins: 2, losses: 1 })
    expect(deckStatsFor(results, versions, 2).record).toMatchObject({ wins: 2, losses: 1, draws: 1 })
  })

  it('treats a deck with no version list (or an older Pairings) as one version', () => {
    expect(deckVersionsOf([])).toEqual([{ n: 1, from: '', cardCount: null, note: '' }])
    expect(resultVersion(result({ deckVersion: 3 }), [])).toBe(1)
    const none = deckStatsFor([], [])
    expect(none.record.winRate).toBeNull()
    expect(none.goingFirst.games + none.goingSecond.games).toBe(0)
  })

  it('reads went_first and the version list from the RPC, tolerating junk', () => {
    const [deck] = parseDeckRecords({
      decks: [
        {
          brewhouse_deck_id: 'bh1',
          versions: [{ n: 1, from: '' }, { n: 2, from: '2026-09-10', card_count: 51, note: 'more removal' }, { n: 'x' }, null],
          results: [{ record: '1-0', matches: [{ opponent: 'Jinx', outcome: 'W', went_first: 'yes' }, { opponent: 'Ahri', outcome: 'L', went_first: 'maybe' }] }],
        },
      ],
    })
    expect(deck.versions).toEqual(versions)
    expect(deck.results[0].matches.map((x) => x.wentFirst)).toEqual(['yes', ''])
  })
})
