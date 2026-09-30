import { describe, expect, it } from 'vitest'
import { MAX_VERSIONS, SESSION_GAP_MS, listKey, shouldSaveBeforeEdit, withVersion, withVersionName, withVersionRestored, withoutVersion } from './deckHistory'
import type { Deck } from './types'

const deck = (zones: Deck['zones'], extra: Partial<Deck> = {}): Deck => ({
  id: 'd1',
  gameId: 'mtg',
  name: 'Burn',
  formatId: 'modern',
  zones,
  freeTextZones: {},
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...extra,
})

const at = '2026-09-02T00:00:00.000Z'

describe('deck history', () => {
  it('compares lists whatever order the cards were added in', () => {
    const a = deck({ main: [{ cardId: 'mtg:a', quantity: 2 }, { cardId: 'mtg:b', quantity: 1 }] })
    const b = deck({ main: [{ cardId: 'mtg:b', quantity: 1 }, { cardId: 'mtg:a', quantity: 1 }, { cardId: 'mtg:a', quantity: 1 }], side: [] })
    expect(listKey(a)).toBe(listKey(b))
    expect(listKey(a)).not.toBe(listKey({ ...a, formatId: 'legacy' }))
  })

  it('saves a version, and not the same list twice', () => {
    const d = deck({ main: [{ cardId: 'mtg:a', quantity: 4 }] })
    const once = withVersion(d, { id: 'v1', at })
    expect(once.versions).toHaveLength(1)
    expect(withVersion(once, { id: 'v2', at })).toBe(once)
    // A name on the same list renames the newest version instead.
    const named = withVersion(once, { id: 'v2', at, name: ' after regionals ' })
    expect(named.versions).toEqual([{ ...once.versions![0], name: 'after regionals' }])
  })

  it('keeps the newest versions, dropping unnamed ones first', () => {
    let d = deck({ main: [] })
    for (let i = 0; i < MAX_VERSIONS + 5; i++) {
      d = withVersion({ ...d, zones: { main: [{ cardId: 'mtg:a', quantity: i + 1 }] } }, { id: `v${i}`, at, name: i === 0 ? 'first' : undefined })
    }
    expect(d.versions).toHaveLength(MAX_VERSIONS)
    expect(d.versions![0].name).toBe('first')
    expect(d.versions!.at(-1)!.id).toBe(`v${MAX_VERSIONS + 4}`)
  })

  it('saves before the first edit of a new session only', () => {
    const changed = Date.parse('2026-09-01T00:00:00.000Z')
    const d = deck({ main: [{ cardId: 'mtg:a', quantity: 4 }] })
    expect(shouldSaveBeforeEdit(d, changed + 60_000)).toBe(false)
    expect(shouldSaveBeforeEdit(d, changed + SESSION_GAP_MS)).toBe(true)
    expect(shouldSaveBeforeEdit(withVersion(d, { id: 'v1', at }), changed + SESSION_GAP_MS)).toBe(false)
    expect(shouldSaveBeforeEdit(deck({}), changed + SESSION_GAP_MS)).toBe(false)
  })

  it('restores, renames and deletes versions', () => {
    const old = withVersion(deck({ main: [{ cardId: 'mtg:a', quantity: 4 }] }), { id: 'v1', at })
    const now = { ...old, formatId: 'legacy', zones: { main: [{ cardId: 'mtg:b', quantity: 4 }] }, notes: 'keep' }
    const back = withVersionRestored(now, old.versions![0])
    expect(back.zones).toEqual(old.zones)
    expect(back.formatId).toBe('modern')
    expect(back.notes).toBe('keep')
    expect(withVersionName(old, 'v1', 'x').versions![0].name).toBe('x')
    expect(withVersionName(withVersionName(old, 'v1', 'x'), 'v1', '').versions![0].name).toBeUndefined()
    expect(withoutVersion(old, 'v1').versions).toBeUndefined()
  })
})
