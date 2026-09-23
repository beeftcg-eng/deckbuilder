import { describe, expect, it } from 'vitest'
import { parseBackupBundle } from './backupBundle'

const deck = { id: 'd1', gameId: 'riftbound', name: 'Diana', formatId: 'constructed', zones: {}, freeTextZones: {}, createdAt: 'x', updatedAt: 'x' }
const binder = { id: 'b1', name: 'Trade binder', cards: { 'pokemon:x': 2 }, createdAt: 'x', updatedAt: 'x' }
const wish = { id: 'w1', gameId: 'pokemon', cardId: 'pokemon:x', quantity: 2, addedAt: 'x', pushedTaskId: null }

describe('parseBackupBundle', () => {
  it('rejects JSON that is not a backup, so a wrong file pick cannot wipe anything', () => {
    for (const notABackup of [{}, { version: 2 }, { hello: 'world' }, [], 'text', null, 42]) {
      expect(parseBackupBundle(notABackup).ok).toBe(false)
    }
  })

  it('accepts a full v3 bundle', () => {
    const parsed = parseBackupBundle({ version: 3, decks: [deck], binders: [binder], wishlist: [wish], collection: { 'pokemon:x': 3 } })
    expect(parsed).toEqual({ ok: true, decks: [deck], binders: [binder], wishlist: [wish], collection: { 'pokemon:x': 3 }, skipped: 0 })
  })

  it('leaves sections the file does not have as null so restore keeps what is on disk', () => {
    const v1 = parseBackupBundle({ version: 1, decks: [deck] })
    expect(v1).toMatchObject({ ok: true, decks: [deck], binders: null, wishlist: null, collection: null })
    const wishlistOnly = parseBackupBundle({ wishlist: [wish] })
    expect(wishlistOnly).toMatchObject({ ok: true, decks: null, binders: null, wishlist: [wish] })
    const bindersOnly = parseBackupBundle({ binders: [binder] })
    expect(bindersOnly).toMatchObject({ ok: true, decks: null, binders: [binder], wishlist: null })
  })

  it('drops malformed entries and counts them', () => {
    const parsed = parseBackupBundle({
      decks: [deck, { id: 'no-zones', gameId: 'riftbound', name: 'x' }, { ...deck, gameId: 'magic' }, 'junk'],
      binders: [binder, { id: 'no-cards', name: 'x' }, 'junk'],
      wishlist: [wish, { id: 'w2' }],
    })
    expect(parsed).toMatchObject({ ok: true, decks: [deck], binders: [binder], wishlist: [wish], skipped: 6 })
  })

  it('keeps only positive whole-number collection counts', () => {
    const parsed = parseBackupBundle({ decks: [], collection: { a: 2, b: 0, c: -1, d: 'x', e: 2.9 } })
    expect(parsed).toMatchObject({ ok: true, collection: { a: 2, e: 2 } })
  })
})
