import { describe, expect, it } from 'vitest'
import { cardsSeenBy, chanceAtLeast } from './sampleHand'

describe('draw odds', () => {
  it('matches known hypergeometric values', () => {
    // A 4-of in a 60-card deck, 7-card opening hand: 39.95%.
    expect(chanceAtLeast(60, 4, 7, 1)).toBeCloseTo(0.3995, 4)
    // 8 copies, 7 cards: 65.36%.
    expect(chanceAtLeast(60, 8, 7, 1)).toBeCloseTo(0.65359, 4)
    // At least 2 of a 4-of in 7 cards: 6.32%.
    expect(chanceAtLeast(60, 4, 7, 2)).toBeCloseTo(0.06322, 4)
  })

  it('handles the edges', () => {
    expect(chanceAtLeast(40, 0, 5, 1)).toBe(0)
    expect(chanceAtLeast(40, 40, 5, 1)).toBe(1)
    expect(chanceAtLeast(40, 3, 5, 0)).toBe(1)
    expect(chanceAtLeast(10, 3, 20, 1)).toBe(1) // seeing the whole deck
  })

  it('counts one draw a turn, none on turn 1 on the play', () => {
    expect(cardsSeenBy(7, 0, true)).toBe(7)
    expect(cardsSeenBy(7, 1, true)).toBe(7)
    expect(cardsSeenBy(7, 1, false)).toBe(8)
    expect(cardsSeenBy(7, 3, true)).toBe(9)
  })
})
