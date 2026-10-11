import { describe, expect, it } from 'vitest'
import { migrateFormats } from './formatMigration'
import { isCardLegalInFormat } from './legality'
import { ROTATED_OUT_SET_IDS, onepieceAdapter } from './games/onepiece'
import { makeCard } from './testFixtures'
import type { Format } from './types'

const OLD_DESCRIPTION =
  'Block 2 onward (OP-05 and later) as of the April 2026 rotation, which retired Block 1 (OP-01–OP-04 and starter decks ST-01–ST-09). Also applies the current official banned/restricted list as a snapshot from onepiece.gg. Bandai rotates the legal block window each April 1st (next: April 2027) — re-check onepiece.gg periodically, neither list is auto-updated.'

const oldStandard = (legalSetIds: string[]): Format => ({
  id: 'standard',
  label: 'Standard (current rotation + ban list)',
  description: OLD_DESCRIPTION,
  legalSetIds,
  bannedCardIds: ['onepiece:OP06-116'],
  restrictedCardIds: [],
  bannedPairs: [],
  reviewedAt: '2026-09-17T21:13:25.184Z',
})
const SHIPPED = ['EB-01', 'EB-02', 'EB-03', 'OP-05', 'OP-06', 'OP-07', 'OP-08', 'OP-09', 'OP-10', 'OP-11', 'OP-12', 'OP-13', 'OP-16', 'OP-17', 'OP14-EB04', 'OP15-EB04', 'PRB-01', 'PRB-02', ...Array.from({ length: 27 }, (_, i) => `ST-${i + 10}`).filter((id) => id !== 'ST-29')]

describe('migrateFormats', () => {
  it('turns the list shipped before into the rotated-out sets', () => {
    const [standard] = migrateFormats('onepiece', [oldStandard(SHIPPED)])!
    expect(standard.legalSetIds).toBeUndefined()
    expect(standard.illegalSetIds).toEqual(ROTATED_OUT_SET_IDS)
    expect(standard.description).toBe(onepieceAdapter.defaultFormats[0].description)
    expect(standard.bannedCardIds).toEqual(['onepiece:OP06-116'])
    expect(standard.reviewedAt).toBe('2026-09-17T21:13:25.184Z')
  })

  it('makes sets released since legal, and keeps what the user unticked or ticked', () => {
    const edited = [...SHIPPED.filter((id) => id !== 'OP-05'), 'OP-01']
    const [standard] = migrateFormats('onepiece', [{ ...oldStandard(edited), description: 'mine' }])!
    expect(standard.illegalSetIds).toContain('OP-05')
    expect(standard.illegalSetIds).not.toContain('OP-01')
    expect(standard.description).toBe('mine')
    const card = (setId: string) => makeCard('onepiece', { name: setId, sourceId: `${setId}-001`, setId })
    expect(isCardLegalInFormat(card('OP-18'), standard).legal).toBe(true)
    expect(isCardLegalInFormat(card('ST-29'), standard).legal).toBe(true)
    expect(isCardLegalInFormat(card('OP-02'), standard).legal).toBe(false)
  })

  it('leaves other games, other formats and migrated lists alone', () => {
    expect(migrateFormats('mtg', [oldStandard(SHIPPED)])).toBeNull()
    expect(migrateFormats('onepiece', [{ ...oldStandard(SHIPPED), id: 'custom' }])).toBeNull()
    expect(migrateFormats('onepiece', onepieceAdapter.defaultFormats)).toBeNull()
  })
})
