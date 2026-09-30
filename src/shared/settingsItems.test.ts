import { describe, expect, it } from 'vitest'
import { hasItemFields, joinSettings, splitSettings, touchesItemFields } from './settingsItems'

describe('settings split into preferences and records', () => {
  const opening = { id: 'o1', gameId: 'riftbound' as const, name: 'Box', date: '2026-09-29', costUsd: 90, pulls: [], addToCollection: false }

  it('puts the growing records apart from the preferences', () => {
    const { prefs, items } = splitSettings({ theme: 'forest', lastDeckId: 'd1', packOpenings: [opening], itemsSynced: true })
    expect(prefs).toEqual({ theme: 'forest', lastDeckId: 'd1' })
    expect(items).toEqual({ packOpenings: [opening], itemsSynced: true })
  })

  it('reads records still sitting in the preferences until they have moved', () => {
    const before = { theme: 'forest', packOpenings: [opening] }
    expect(hasItemFields(before)).toBe(true)
    expect(joinSettings(before, {})).toEqual(before)
    // Once moved, the records store wins.
    expect(joinSettings(before, { packOpenings: [] })).toEqual({ theme: 'forest', packOpenings: [] })
  })

  it('never lets a preference in the records store override the real one', () => {
    expect(joinSettings({ theme: 'forest' }, { theme: 'ocean' } as never)).toEqual({ theme: 'forest' })
  })

  it('knows which patches touch the records', () => {
    expect(touchesItemFields({ theme: 'forest' })).toBe(false)
    expect(touchesItemFields({ collectionDetails: {} })).toBe(true)
  })
})
