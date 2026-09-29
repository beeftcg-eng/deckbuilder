import { describe, expect, it } from 'vitest'
import { checkPriceAlerts, parseMoney, sanitizePriceAlerts, targetToUsd } from './priceAlerts'
import type { Card, WishlistEntry } from './types'

const card = (id: string, price: number | null) => ({ id, name: id, price }) as unknown as Card
const want = (cardId: string) => ({ id: `w-${cardId}`, gameId: 'mtg', cardId, quantity: 1, addedAt: '', pushedTaskId: null }) as WishlistEntry

describe('checkPriceAlerts', () => {
  it('goes off once when the price reaches the target, and re-arms above it', () => {
    let prices: Record<string, number | null> = { a: 12 }
    const lookup = (id: string) => (id in prices ? card(id, prices[id]) : undefined)
    let alerts = { a: { target: 10 } }

    expect(checkPriceAlerts(alerts, lookup)).toEqual({ hits: [], next: null })

    prices = { a: 9.5 }
    const first = checkPriceAlerts(alerts, lookup)
    expect(first.hits.map((h) => [h.card.id, h.price, h.target])).toEqual([['a', 9.5, 10]])
    alerts = first.next as typeof alerts
    expect(alerts).toEqual({ a: { target: 10, hit: true } })

    // Still low: no second alert.
    expect(checkPriceAlerts(alerts, lookup)).toEqual({ hits: [], next: null })

    prices = { a: 11 }
    const up = checkPriceAlerts(alerts, lookup)
    expect(up.hits).toEqual([])
    expect(up.next).toEqual({ a: { target: 10 } })
  })

  it('counts exactly the target as reached', () => {
    expect(checkPriceAlerts({ a: { target: 10 } }, () => card('a', 10)).hits).toHaveLength(1)
  })

  it('leaves cards without data or price alone', () => {
    const alerts = { a: { target: 10 }, b: { target: 5 } }
    expect(checkPriceAlerts(alerts, (id) => (id === 'b' ? card('b', null) : undefined))).toEqual({ hits: [], next: null })
  })

  it('drops alerts for cards no longer wishlisted', () => {
    const r = checkPriceAlerts({ a: { target: 10 }, b: { target: 5 } }, () => undefined, [want('b')])
    expect(r.next).toEqual({ b: { target: 5 } })
  })
})

describe('targetToUsd', () => {
  it('converts from the shown currency', () => {
    expect(targetToUsd('200', 20)).toBe(10)
    expect(targetToUsd('$1,50', 1)).toBe(1.5)
    expect(targetToUsd('12.5 MXN', 1)).toBe(12.5)
  })

  it('rejects nothing, zero and junk', () => {
    expect(targetToUsd('', 1)).toBeNull()
    expect(targetToUsd('0', 1)).toBeNull()
    expect(targetToUsd('abc', 1)).toBeNull()
    expect(targetToUsd('5', 0)).toBeNull()
  })
})

describe('sanitizePriceAlerts', () => {
  it('keeps only valid alerts', () => {
    expect(sanitizePriceAlerts({ a: { target: 3, hit: true }, b: { target: -1 }, c: 'x', d: { target: 2, hit: 'yes' } })).toEqual({
      a: { target: 3, hit: true },
      d: { target: 2 },
    })
    expect(sanitizePriceAlerts([])).toEqual({})
  })
})

describe('parseMoney', () => {
  it('reads either decimal separator and thousands groups', () => {
    expect(parseMoney('12.50')).toBe(12.5)
    expect(parseMoney('12,5')).toBe(12.5)
    expect(parseMoney('$1,500')).toBe(1500)
    expect(parseMoney('1.500')).toBe(1500)
    expect(parseMoney('1,500.75')).toBe(1500.75)
    expect(parseMoney('1.500,75 €')).toBe(1500.75)
    expect(parseMoney('2,000,000')).toBe(2000000)
    expect(parseMoney('90')).toBe(90)
    expect(parseMoney('MXN')).toBeNull()
  })
})
