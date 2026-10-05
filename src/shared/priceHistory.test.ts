import { describe, expect, it } from 'vitest'
import { HISTORY_DAYS, addDay, cardHistory, emptyShard, parseShard, shardOf } from './priceHistory'

describe('price history', () => {
  it('adds a day, replaces a day added twice, and keeps cards missing today as gaps', () => {
    let shard = addDay(emptyShard(), '2026-10-01', { a: 1, b: 2 })
    shard = addDay(shard, '2026-10-02', { a: 1.5 })
    shard = addDay(shard, '2026-10-02', { a: 1.25, c: 9 })
    expect(shard).toEqual({ days: ['2026-10-01', '2026-10-02'], prices: { a: [1, 1.25], b: [2, null], c: [null, 9] } })
    expect(cardHistory(shard, ['x', 'b'])).toEqual([{ d: '2026-10-01', v: 2 }])
  })

  it(`keeps the last ${HISTORY_DAYS} days and forgets cards with none of them`, () => {
    let shard = addDay(emptyShard(), '2026-01-01', { gone: 5 })
    for (let i = 1; i <= HISTORY_DAYS; i++) shard = addDay(shard, `day-${String(i).padStart(3, '0')}`, { a: i })
    expect(shard.days).toHaveLength(HISTORY_DAYS)
    expect(shard.days[0]).toBe('day-001')
    expect(shard.prices.gone).toBeUndefined()
    expect(shard.prices.a).toHaveLength(HISTORY_DAYS)
  })

  it('spreads keys over the shards the same way every time', () => {
    expect(shardOf('RB|VEN|21a', 32)).toBe(shardOf('RB|VEN|21a', 32))
    const used = new Set(Array.from({ length: 500 }, (_, i) => shardOf(`key-${i}`, 32)))
    expect(used.size).toBe(32)
  })

  it('reads only well-formed shards', () => {
    expect(parseShard({ days: ['2026-10-01'], prices: { a: [1] } })).toEqual({ days: ['2026-10-01'], prices: { a: [1] } })
    expect(parseShard({ days: 'nope' })).toBeNull()
    expect(parseShard(null)).toBeNull()
  })
})
