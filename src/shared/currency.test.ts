import { afterEach, describe, expect, it } from 'vitest'
import { displayCurrency, formatMoney, setDisplayCurrency } from './currency'

afterEach(() => setDisplayCurrency('USD', null))

describe('currency', () => {
  it('shows US dollars by default', () => {
    expect(formatMoney(12.5)).toBe('$12.50')
  })

  it('converts to pesos with the day’s rate and says which dollar sign it is', () => {
    setDisplayCurrency('MXN', { MXN: 17.765 })
    expect(displayCurrency()).toBe('MXN')
    expect(formatMoney(10)).toMatch(/177\.65/)
    expect(formatMoney(10)).toMatch(/MX|MXN/)
  })

  it('stays in dollars when there is no rate for the currency yet', () => {
    setDisplayCurrency('MXN', null)
    expect(displayCurrency()).toBe('USD')
    expect(formatMoney(1)).toBe('$1.00')
  })

  it('drops cents for yen', () => {
    setDisplayCurrency('JPY', { JPY: 156.88 })
    expect(formatMoney(10)).toMatch(/1,569/)
    expect(formatMoney(10)).not.toMatch(/\./)
  })
})
