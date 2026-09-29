import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getLocale: () => 'en-US' }, ipcMain: { handle: () => {} } }))
const { sanitize } = await import('./settings')

describe('desktop settings', () => {
  it('keeps the currency, its exchange rates and artwork choices', () => {
    const saved = sanitize({
      currency: 'MXN',
      currencyRates: { updatedAt: '2026-09-29T00:00:00Z', rates: { MXN: 17.765, EUR: 0.879, bad: 3, JPY: -1 } },
      artChoices: { 'yugioh:89631139~LOB~Ultra Rare': '89631140' },
      theme: 'nope',
    })
    expect(saved.currency).toBe('MXN')
    expect(saved.currencyRates).toEqual({ updatedAt: '2026-09-29T00:00:00Z', rates: { MXN: 17.765, EUR: 0.879 } })
    expect(saved.artChoices).toEqual({ 'yugioh:89631139~LOB~Ultra Rare': '89631140' })
    expect(saved.theme).toBeUndefined()
  })

  it('drops malformed values', () => {
    const saved = sanitize({ currency: 'pesos', currencyRates: { rates: { MXN: 17 } }, artChoices: 'x' })
    expect(saved.currency).toBeUndefined()
    expect(saved.currencyRates).toBeUndefined()
    expect(saved.artChoices).toBeUndefined()
  })
  it('keeps value history and price alerts', () => {
    const saved = sanitize({
      valueHistory: { mtg: [{ d: '2026-09-28', v: 12.5 }], nope: [{ d: '2026-09-28', v: 1 }] },
      priceAlerts: { 'mtg:abc': { target: 4, hit: true }, bad: { target: 'x' } },
    })
    expect(saved.valueHistory).toEqual({ mtg: [{ d: '2026-09-28', v: 12.5 }] })
    expect(saved.priceAlerts).toEqual({ 'mtg:abc': { target: 4, hit: true } })
  })

  it('keeps pack openings, dropping broken ones and bad pulls', () => {
    const good = { id: 'o1', gameId: 'riftbound', name: 'Box', date: '2026-09-29', costUsd: 90, pulls: [{ cardId: 'riftbound:a', quantity: 2 }, { cardId: 'x', quantity: 0 }], addToCollection: true }
    const saved = sanitize({ packOpenings: [good, { id: 'o2', gameId: 'chess', name: 'x' }, 'nope'] })
    expect(saved.packOpenings).toEqual([{ ...good, pulls: [{ cardId: 'riftbound:a', quantity: 2 }] }])
  })
})
