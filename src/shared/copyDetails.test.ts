import { describe, expect, it } from 'vitest'
import { copyBreakdown, copyPrice, fitDetails, normalizeDetails, ownedValue, parseCondition, parseFinish, pruneDetails, sanitizeCollectionDetails, withDetail } from './copyDetails'

describe('copy details', () => {
  it('fills the rest of the copies in as plain Near Mint', () => {
    expect(copyBreakdown(4, [{ finish: 'foil', condition: 'NM', quantity: 1 }])).toEqual([
      { finish: 'normal', condition: 'NM', quantity: 3 },
      { finish: 'foil', condition: 'NM', quantity: 1 },
    ])
    expect(copyBreakdown(2, undefined)).toEqual([{ finish: 'normal', condition: 'NM', quantity: 2 }])
    expect(copyBreakdown(0, [{ finish: 'foil', condition: 'NM', quantity: 1 }])).toEqual([])
  })

  it('trims details down to the copies you own', () => {
    const details = [
      { finish: 'foil' as const, condition: 'NM' as const, quantity: 2 },
      { finish: 'normal' as const, condition: 'LP' as const, quantity: 2 },
    ]
    expect(fitDetails(3, details)).toEqual([
      { finish: 'foil', condition: 'NM', quantity: 2 },
      { finish: 'normal', condition: 'LP', quantity: 1 },
    ])
  })

  it('merges, drops plain entries and sorts', () => {
    expect(
      normalizeDetails([
        { finish: 'normal', condition: 'NM', quantity: 5 },
        { finish: 'normal', condition: 'HP', quantity: 1 },
        { finish: 'foil', condition: 'LP', quantity: 1 },
        { finish: 'foil', condition: 'LP', quantity: 2 },
        { finish: 'etched', condition: 'NM', quantity: 0 },
      ]),
    ).toEqual([
      { finish: 'foil', condition: 'LP', quantity: 3 },
      { finish: 'normal', condition: 'HP', quantity: 1 },
    ])
  })

  it('sets one kind without touching the others', () => {
    const start = [{ finish: 'foil' as const, condition: 'NM' as const, quantity: 1 }]
    expect(withDetail(start, { finish: 'normal', condition: 'MP' }, 2)).toEqual([
      { finish: 'foil', condition: 'NM', quantity: 1 },
      { finish: 'normal', condition: 'MP', quantity: 2 },
    ])
    expect(withDetail(start, { finish: 'foil', condition: 'NM' }, 0)).toEqual([])
  })

  it('prices foil copies at the foil price when the card has one', () => {
    const card = { price: 1, foilPrice: 5 }
    expect(copyPrice(card, 'foil')).toBe(5)
    expect(copyPrice(card, 'normal')).toBe(1)
    expect(copyPrice({ price: 1 }, 'etched')).toBe(1)
    expect(ownedValue(card, 3, [{ finish: 'foil', condition: 'LP', quantity: 1 }])).toBe(7)
  })

  it('drops details of cards no longer owned', () => {
    const details = { 'mtg:a': [{ finish: 'foil' as const, condition: 'NM' as const, quantity: 2 }], 'mtg:b': [{ finish: 'foil' as const, condition: 'NM' as const, quantity: 1 }] }
    expect(pruneDetails(details, { 'mtg:a': 1 })).toEqual({ 'mtg:a': [{ finish: 'foil', condition: 'NM', quantity: 1 }] })
    const same = { 'mtg:a': [{ finish: 'foil' as const, condition: 'NM' as const, quantity: 1 }] }
    expect(pruneDetails(same, { 'mtg:a': 3 })).toBe(same)
  })

  it('reads the finish and condition words collection apps export', () => {
    expect(parseFinish('Foil')).toBe('foil')
    expect(parseFinish('Holofoil')).toBe('foil')
    expect(parseFinish('Reverse Holofoil')).toBe('foil')
    expect(parseFinish('etched')).toBe('etched')
    expect(parseFinish('normal')).toBe('normal')
    expect(parseFinish('true')).toBe('foil')
    expect(parseFinish('')).toBeNull()
    expect(parseCondition('Near Mint')).toBe('NM')
    expect(parseCondition('near_mint')).toBe('NM')
    expect(parseCondition('Lightly Played Foil')).toBe('LP')
    expect(parseCondition('excellent')).toBe('LP')
    expect(parseCondition('MP')).toBe('MP')
    expect(parseCondition('Heavily Played')).toBe('HP')
    expect(parseCondition('Damaged')).toBe('DMG')
    expect(parseCondition('what')).toBeNull()
  })

  it('keeps only well-formed details from disk', () => {
    expect(sanitizeCollectionDetails({ 'mtg:a': [{ finish: 'foil', condition: 'NM', quantity: 1 }, { finish: 'shiny', condition: 'NM', quantity: 1 }], 'mtg:b': 'x' })).toEqual({
      'mtg:a': [{ finish: 'foil', condition: 'NM', quantity: 1 }],
    })
  })
})
