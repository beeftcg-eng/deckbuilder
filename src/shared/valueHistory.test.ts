import { describe, expect, it } from 'vitest'
import { localDay, MAX_POINTS, recordValue, sanitizeValueHistory, valueChange, type ValuePoint } from './valueHistory'

describe('recordValue', () => {
  it('adds a point per day and overwrites the same day', () => {
    const a = recordValue(undefined, 'mtg', 10, '2026-09-01')!
    expect(a.mtg).toEqual([{ d: '2026-09-01', v: 10 }])
    const b = recordValue(a, 'mtg', 12.345, '2026-09-01')!
    expect(b.mtg).toEqual([{ d: '2026-09-01', v: 12.35 }])
    const c = recordValue(b, 'mtg', 15, '2026-09-02')!
    expect(c.mtg).toEqual([
      { d: '2026-09-01', v: 12.35 },
      { d: '2026-09-02', v: 15 },
    ])
  })

  it('returns null when nothing changes', () => {
    const a = recordValue(undefined, 'mtg', 10, '2026-09-01')!
    expect(recordValue(a, 'mtg', 10, '2026-09-01')).toBeNull()
    expect(recordValue(undefined, 'mtg', 0, '2026-09-01')).toBeNull()
    expect(recordValue(a, 'mtg', Number.NaN, '2026-09-02')).toBeNull()
  })

  it('records a drop to zero once there is history', () => {
    const a = recordValue(undefined, 'mtg', 10, '2026-09-01')!
    expect(recordValue(a, 'mtg', 0, '2026-09-02')!.mtg!.at(-1)).toEqual({ d: '2026-09-02', v: 0 })
  })

  it('leaves other games alone and caps the length', () => {
    let h = recordValue(undefined, 'pokemon', 5, '2026-01-01')!
    for (let i = 0; i < MAX_POINTS + 10; i++) h = recordValue(h, 'mtg', i + 1, localDay(new Date(2025, 0, 1 + i)))!
    expect(h.mtg).toHaveLength(MAX_POINTS)
    expect(h.pokemon).toEqual([{ d: '2026-01-01', v: 5 }])
  })

  it('drops later points when the clock went back', () => {
    const a = recordValue(recordValue(undefined, 'mtg', 1, '2026-09-05')!, 'mtg', 2, '2026-09-06')!
    expect(recordValue(a, 'mtg', 3, '2026-09-04')!.mtg).toEqual([{ d: '2026-09-04', v: 3 }])
  })
})

describe('valueChange', () => {
  const points: ValuePoint[] = [
    { d: '2026-07-01', v: 50 },
    { d: '2026-08-20', v: 100 },
    { d: '2026-09-10', v: 110 },
    { d: '2026-09-28', v: 120 },
  ]

  it('measures from the last point at or before the window start', () => {
    const c = valueChange(points, 30, '2026-09-28')!
    expect(c.from).toEqual({ d: '2026-08-20', v: 100 })
    expect(c.diff).toBe(20)
    expect(c.percent).toBeCloseTo(20)
  })

  it('uses the first point when the history is shorter than the window', () => {
    expect(valueChange(points, 365, '2026-09-28')!.from.d).toBe('2026-07-01')
  })

  it('compares with the previous point when the window only holds today', () => {
    expect(valueChange(points, 0, '2026-09-28')!.from.d).toBe('2026-09-10')
  })

  it('needs two points, and has no percentage from zero', () => {
    expect(valueChange(points.slice(0, 1), 30, '2026-09-28')).toBeNull()
    expect(valueChange([{ d: '2026-09-01', v: 0 }, { d: '2026-09-02', v: 5 }], 30, '2026-09-02')!.percent).toBeNull()
  })
})

describe('sanitizeValueHistory', () => {
  it('keeps valid points of known games, sorted and one per day', () => {
    const out = sanitizeValueHistory(
      {
        mtg: [{ d: '2026-09-02', v: 2 }, { d: '2026-09-01', v: 1 }, { d: 'x', v: 1 }, { d: '2026-09-03', v: -1 }, { d: '2026-09-02', v: 3 }, null],
        nope: [{ d: '2026-09-01', v: 1 }],
        pokemon: 'bad',
      },
      ['mtg', 'pokemon'],
    )
    expect(out).toEqual({ mtg: [{ d: '2026-09-01', v: 1 }, { d: '2026-09-02', v: 3 }] })
    expect(sanitizeValueHistory(null, ['mtg'])).toEqual({})
  })
})
