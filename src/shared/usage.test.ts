// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { countUse, daysToSend, featureName, localDay, pendingUsage, sendUsage, setUsageEnabled } from './usage'

afterEach(() => {
  setUsageEnabled(false)
  vi.unstubAllGlobals()
})

describe('anonymous usage counts', () => {
  it('counts nothing while the setting is off', () => {
    setUsageEnabled(false)
    countUse('window:export-modal')
    expect(pendingUsage()).toEqual({})
  })

  it('counts fixed names by day, and refuses anything else', () => {
    setUsageEnabled(true)
    const day = new Date(2026, 10, 13, 12)
    countUse('window:export-modal', day)
    countUse('window:export-modal', day)
    countUse('panel:MyDecks', day)
    countUse('???', day)
    expect(pendingUsage()).toEqual({ '2026-11-13': { 'window:export-modal': 2, 'panel:my-decks': 1 } })
    expect(featureName('Mein Deck!')).toBe('mein-deck')
    expect(featureName('')).toBeNull()
  })

  it('sends finished days only, drops month-old ones, and keeps a day that failed', () => {
    const now = new Date(2026, 10, 13, 12)
    const { send, keep } = daysToSend({ '2026-11-13': { a: 1 }, '2026-11-12': { b: 2 }, '2026-09-01': { c: 3 } }, now)
    expect(send).toEqual([['2026-11-12', { b: 2 }]])
    expect(keep).toEqual({ '2026-11-13': { a: 1 } })
    expect(localDay(now)).toBe('2026-11-13')
  })

  it('posts each day with platform and version, and forgets it once accepted', async () => {
    setUsageEnabled(true)
    const today = new Date(2026, 10, 13, 12)
    countUse('game:onepiece', new Date(2026, 10, 12, 12))
    countUse('game:pokemon', new Date(2026, 10, 11, 12))
    countUse('game:mtg', today)
    const bodies: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body))
        bodies.push(body)
        return new Response('', { status: body.p_day === '2026-11-11' ? 500 : 204 })
      }),
    )
    await sendUsage('web', '0.56.0', today)
    expect(bodies).toContainEqual({ p_day: '2026-11-12', p_platform: 'web', p_version: '0.56.0', p_counts: { 'game:onepiece': 1 } })
    expect(pendingUsage()).toEqual({ '2026-11-11': { 'game:pokemon': 1 }, '2026-11-13': { 'game:mtg': 1 } })
  })
})
