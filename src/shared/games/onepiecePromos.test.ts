import { describe, expect, it } from 'vitest'
import { isBlockOnePromo, isRotationLegalPromo } from './onepiecePromos'
import { isCardLegalInFormat } from '../legality'
import { onepieceAdapter } from './onepiece'
import { makeCard } from '../testFixtures'

const promo = (sourceId: string) => makeCard('onepiece', { name: 'Promo', sourceId, setId: 'P' })
const standard = onepieceAdapter.defaultFormats.find((f) => f.id === 'standard')!

describe('isBlockOnePromo', () => {
  it('puts P-001–P-039 in Block 1 and later P numbers after it', () => {
    expect(['P-001', 'P-038', 'P-039'].map(isBlockOnePromo)).toEqual([true, true, true])
    expect(['P-041', 'P-084', 'P-098', 'P-700'].map(isBlockOnePromo)).toEqual([false, false, false, false])
  })

  it('puts reprints of Block 1 set cards in Block 1', () => {
    expect(['OP01-015', 'OP04-090', 'ST01-012', 'ST09-004'].map(isBlockOnePromo)).toEqual([true, true, true, true])
    expect(['OP05-060', 'OP09-077', 'ST10-001', 'ST13-003', 'EB01-003', 'PRB02-001'].map(isBlockOnePromo)).toEqual([false, false, false, false, false, false])
  })
})

describe('promo legality in Standard', () => {
  it('allows Block 2+ promos without the promo set being listed, and not Block 1 ones', () => {
    expect(standard.legalSetIds).not.toContain('P')
    expect(isCardLegalInFormat(promo('P-098'), standard).legal).toBe(true)
    expect(isCardLegalInFormat(promo('OP09-077'), standard).legal).toBe(true)
    expect(isCardLegalInFormat(promo('P-001'), standard).legal).toBe(false)
    expect(isCardLegalInFormat(promo('OP01-015'), standard).legal).toBe(false)
  })

  it('still applies the ban list to promos', () => {
    expect(isCardLegalInFormat(promo('OP06-086'), standard)).toEqual({ legal: false, reason: 'is banned' })
  })

  it('only applies to One Piece promos', () => {
    expect(isRotationLegalPromo(makeCard('onepiece', { name: 'Set card', sourceId: 'OP05-001', setId: 'OP-04' }))).toBe(false)
    expect(isRotationLegalPromo(makeCard('pokemon', { name: 'Other', sourceId: 'P-098', setId: 'P' }))).toBe(false)
  })
})
