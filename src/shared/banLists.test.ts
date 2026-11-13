import { describe, expect, it } from 'vitest'
import { applyYgoBanLists, diffStatuses, formatUpdate, listedCards, mergePublishedFormat, publishedFormatOf, readBanListsFile, sanitizeBanListsSeen, type PublishedFormat } from './banLists'
import { migrateFormats } from './formatMigration'
import { onepieceAdapter } from './games/onepiece'
import { makeCard } from './testFixtures'
import type { Format } from './types'

const format = (over: Partial<Format> = {}): Format => ({ id: 'standard', label: 'Standard', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [], ...over })
const pub = (over: Partial<PublishedFormat> = {}): PublishedFormat => ({ bannedCardIds: [], restrictedCardIds: [], bannedPairs: [], ...over })

describe('mergePublishedFormat', () => {
  it('replaces a list that never had a published one (saved lists never updated before)', () => {
    const merged = mergePublishedFormat(format({ bannedCardIds: ['op:A'] }), pub({ bannedCardIds: ['op:B', 'op:C'] }))!
    expect(merged.bannedCardIds).toEqual(['op:B', 'op:C'])
    expect(merged.published).toEqual(pub({ bannedCardIds: ['op:B', 'op:C'] }))
  })

  it('keeps your own bans and unbans when a new list comes out', () => {
    const last = pub({ bannedCardIds: ['op:A', 'op:B'] })
    // You banned X yourself and unbanned B.
    const local = format({ bannedCardIds: ['op:A', 'op:X'], published: last })
    const merged = mergePublishedFormat(local, pub({ bannedCardIds: ['op:A', 'op:B', 'op:C'] }))!
    expect(merged.bannedCardIds.sort()).toEqual(['op:A', 'op:C', 'op:X'])
  })

  it('takes an official unban', () => {
    const last = pub({ bannedCardIds: ['op:A', 'op:B'] })
    const merged = mergePublishedFormat(format({ bannedCardIds: ['op:A', 'op:B'], published: last }), pub({ bannedCardIds: ['op:A'] }))!
    expect(merged.bannedCardIds).toEqual(['op:A'])
  })

  it('merges banned pairs in either order', () => {
    const last = pub({ bannedPairs: [['op:A', 'op:B']] })
    const local = format({ bannedPairs: [['op:B', 'op:A']], published: last })
    const merged = mergePublishedFormat(local, pub({ bannedPairs: [['op:A', 'op:B'], ['op:C', 'op:D']] }))!
    expect(merged.bannedPairs).toHaveLength(2)
  })

  it('does nothing when the published list is the one already merged', () => {
    const last = pub({ bannedCardIds: ['op:A'] })
    expect(mergePublishedFormat(format({ bannedCardIds: ['op:A', 'op:X'], published: last }), last)).toBeNull()
  })

  it('rotates sets out and keeps a set you turned back on', () => {
    const last = pub({ illegalSetIds: ['OP-01'] })
    const local = format({ illegalSetIds: [], published: last })
    const merged = mergePublishedFormat(local, pub({ illegalSetIds: ['OP-01', 'OP-05'] }))!
    expect(merged.illegalSetIds).toEqual(['OP-05'])
  })

  it('follows the published rotation date unless you typed your own', () => {
    const last = pub({ nextRotation: { date: '2027-04-01', leavingSetIds: [] } })
    const followed = mergePublishedFormat(format({ nextRotation: { date: '2027-04-01', leavingSetIds: [] }, published: last }), pub({ nextRotation: { date: '2027-04-02', leavingSetIds: ['OP-05'] } }))!
    expect(followed.nextRotation).toEqual({ date: '2027-04-02', leavingSetIds: ['OP-05'] })
    const own = mergePublishedFormat(format({ nextRotation: { date: '2027-05-01', leavingSetIds: [] }, published: last }), pub({ nextRotation: { date: '2027-04-02', leavingSetIds: [] } }))!
    expect(own.nextRotation?.date).toBe('2027-05-01')
  })
})

describe('formatUpdate', () => {
  it('lists the cards, pairs and sets that changed', () => {
    const before = format({ bannedCardIds: ['op:A'], restrictedCardIds: ['op:B'], illegalSetIds: ['S1'] })
    const after = format({ bannedCardIds: ['op:B'], bannedPairs: [['op:C', 'op:D']], illegalSetIds: ['S2'] })
    const u = formatUpdate('onepiece', 'Standard', before, after, (k) => k.toUpperCase())
    expect(u.changes).toEqual([
      { key: 'op:B', name: 'OP:B', from: 'restricted', to: 'banned' },
      { key: 'op:A', name: 'OP:A', from: 'banned', to: 'legal' },
    ])
    expect(u.pairsAdded).toEqual([['OP:C', 'OP:D']])
    expect(u.setsRotatedOut).toEqual(['S2'])
    expect(u.setsBack).toEqual(['S1'])
  })
})

describe('Yu-Gi-Oh! lists', () => {
  const pot = makeCard('yugioh', { name: 'Pot of Greed', sourceId: '55144522', legality: { tcg: 'banned', goat: 'banned' } })
  const ash = makeCard('yugioh', { name: 'Ash Blossom', sourceId: '14558127', legality: { tcg: 'legal', ocg: 'legal' } })

  it('lays a list newer than the card data over it', () => {
    const seen = { 'yugioh:tcg': { updatedAt: '2026-11-10T00:00:00Z', cards: { '14558127': 'restricted' as const } } }
    const [p, a] = applyYgoBanLists([pot, ash], seen, '2026-11-01T00:00:00Z')
    expect(p.legality).toEqual({ tcg: 'legal', goat: 'banned' })
    expect(a.legality).toEqual({ tcg: 'restricted', ocg: 'legal' })
  })

  it('leaves card data downloaded after the list alone', () => {
    const seen = { 'yugioh:tcg': { updatedAt: '2026-11-10T00:00:00Z', cards: {} } }
    const cards = [pot, ash]
    expect(applyYgoBanLists(cards, seen, '2026-11-12T00:00:00Z')).toBe(cards)
  })

  it('never puts a card into a format it is not in', () => {
    const seen = { 'yugioh:ocg': { updatedAt: '2026-11-10T00:00:00Z', cards: { '55144522': 'banned' as const } } }
    expect(applyYgoBanLists([pot], seen, null)[0].legality).toEqual(pot.legality)
  })

  it('lists a format’s cards once per name, strictest first', () => {
    const pot2 = makeCard('yugioh', { name: 'Pot of Greed', sourceId: '55144522', legality: { tcg: 'banned' } })
    const limited = makeCard('yugioh', { name: 'Called by the Grave', legality: { tcg: 'restricted' } })
    expect(listedCards([limited, pot, pot2, ash], 'tcg').map((l) => [l.card.name, l.status])).toEqual([
      ['Pot of Greed', 'banned'],
      ['Called by the Grave', 'restricted'],
    ])
  })

  it('diffs two lists', () => {
    expect(diffStatuses({ a: 'banned', b: 'restricted' }, { b: 'semi-restricted', c: 'banned' }, (k) => k)).toEqual([
      { key: 'c', name: 'c', from: 'legal', to: 'banned' },
      { key: 'b', name: 'b', from: 'restricted', to: 'semi-restricted' },
      { key: 'a', name: 'a', from: 'banned', to: 'legal' },
    ])
  })
})

describe('reading the file and settings', () => {
  it('keeps the valid parts of a published file', () => {
    const file = readBanListsFile({
      updatedAt: '2026-11-13T00:00:00Z',
      formats: { onepiece: { standard: { bannedCardIds: ['a'], restrictedCardIds: [], bannedPairs: [['a', 'b'], ['x']] }, broken: { bannedCardIds: 3 } }, magic: {} },
      yugioh: { tcg: { cards: { '1': 'banned', '2': 'nonsense' }, names: { '1': 'One' } } },
    })!
    expect(file.formats.onepiece).toEqual({ standard: { bannedCardIds: ['a'], restrictedCardIds: [], bannedPairs: [['a', 'b']] } })
    expect(file.yugioh?.tcg).toEqual({ cards: { '1': 'banned' }, names: { '1': 'One' } })
    expect(readBanListsFile({ formats: {} })).toBeNull()
  })

  it('sanitizes saved snapshots', () => {
    expect(sanitizeBanListsSeen({ 'yugioh:tcg': { updatedAt: 'x', cards: { '1': 'restricted', '2': 1 } }, 'bad key!': {} })).toEqual({
      'yugioh:tcg': { updatedAt: 'x', cards: { '1': 'restricted' } },
    })
  })

  it('publishes what the repo ships', () => {
    const standard = onepieceAdapter.defaultFormats[0]
    expect(publishedFormatOf(standard).bannedCardIds).toEqual(standard.bannedCardIds)
  })
})

describe('old descriptions', () => {
  it('get the current wording, which says the list updates itself', () => {
    const old =
      "Block 2 onward (OP-05 and later) as of the April 2026 rotation, which retired Block 1 (OP-01–OP-04 and starter decks ST-01–ST-09). New sets count as legal as soon as they're downloaded. Also applies the current official banned/restricted list as a snapshot from onepiece.gg. Bandai rotates the legal block window each April 1st (next: April 2027) — the rotated-out sets and the ban list are kept by hand, so re-check onepiece.gg then."
    const [migrated] = migrateFormats('onepiece', [{ ...onepieceAdapter.defaultFormats[0], description: old }])!
    expect(migrated.description).toBe(onepieceAdapter.defaultFormats[0].description)
    expect(migrateFormats('onepiece', [{ ...onepieceAdapter.defaultFormats[0], description: 'My own words' }])).toBeNull()
  })
})
