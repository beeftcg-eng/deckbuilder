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

  it('remembers the last announcement shown, so it shows once', () => {
    expect(sanitize({ announcementSeen: 'Anuncio 10/10/2026' }).announcementSeen).toBe('Anuncio 10/10/2026')
    expect(sanitize({ announcementSeen: 3 }).announcementSeen).toBeUndefined()
  })

  it('keeps every setting the app has', async () => {
    // A setting the app saves but this file doesn't let through is lost at every launch.
    const types = (await import('node:fs')).readFileSync(new URL('../../src/shared/types.ts', import.meta.url), 'utf8')
    const block = types.slice(types.indexOf('export interface AppSettings'))
    const keys = [...block.slice(0, block.indexOf('\n}\n')).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1])
    const source = (await import('node:fs')).readFileSync(new URL('./settings.ts', import.meta.url), 'utf8')
    expect(keys.filter((k) => !source.includes(`source.${k}`))).toEqual([])
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
