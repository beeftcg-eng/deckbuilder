import { describe, expect, it } from 'vitest'
import { RESYNC_AFTER_MS, isCatalogStale } from './catalogAge'

describe('isCatalogStale', () => {
  const now = Date.parse('2026-10-11T12:00:00Z')

  it('leaves a game that was never downloaded alone', () => {
    expect(isCatalogStale(null, now)).toBe(false)
    expect(isCatalogStale(undefined, now)).toBe(false)
  })

  it('is stale once the cards are a week old', () => {
    expect(isCatalogStale(new Date(now - RESYNC_AFTER_MS + 60_000).toISOString(), now)).toBe(false)
    expect(isCatalogStale(new Date(now - RESYNC_AFTER_MS).toISOString(), now)).toBe(true)
  })

  it('treats an unreadable date as stale', () => {
    expect(isCatalogStale('not a date', now)).toBe(true)
  })
})
