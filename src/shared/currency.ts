/**
 * Prices are stored in US dollars (every price source is TCGplayer's or Scryfall's USD market price)
 * and shown in the currency picked in settings, converted with the day's exchange rate. The rates
 * come from the European Central Bank via frankfurter.dev, published with the price files
 * (scripts/build-prices.ts -> prices/rates.json); the app keeps the last rates it got for offline use.
 */

export interface CurrencyInfo {
  code: string
  /** Shown in the picker. */
  label: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', label: 'US dollar (USD)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'CAD', label: 'Canadian dollar (CAD)' },
  { code: 'GBP', label: 'Pound sterling (GBP)' },
  { code: 'BRL', label: 'Real brasileiro (BRL)' },
  { code: 'JPY', label: 'Japanese yen (JPY)' },
  { code: 'AUD', label: 'Australian dollar (AUD)' },
]

export interface RatesFile {
  updatedAt: string
  base: 'USD'
  /** currency -> units per US dollar */
  rates: Record<string, number>
}

let current = { code: 'USD', rate: 1 }
const formatters = new Map<string, Intl.NumberFormat>()

/** Switches every price shown to this currency. Without a known rate for it, prices stay in dollars. */
export function setDisplayCurrency(code: string, rates: Record<string, number> | null | undefined): void {
  const rate = code === 'USD' ? 1 : rates?.[code]
  current = rate && rate > 0 ? { code, rate } : { code: 'USD', rate: 1 }
}

export function displayCurrency(): string {
  return current.code
}

function formatter(code: string): Intl.NumberFormat {
  let f = formatters.get(code)
  if (!f) {
    // Yen have no cents.
    const whole = code === 'JPY'
    f = new Intl.NumberFormat(code === 'MXN' ? 'es-MX' : 'en-US', {
      style: 'currency',
      currency: code,
      // "MX$" / "CA$" rather than a bare "$" that would read as dollars.
      currencyDisplay: code === 'USD' ? 'narrowSymbol' : 'symbol',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    })
    formatters.set(code, f)
  }
  return f
}

/** A US-dollar amount, shown in the picked currency. */
export function formatMoney(usd: number): string {
  const text = formatter(current.code).format(usd * current.rate)
  // es-MX writes pesos as a bare "$"; say which dollar sign it is.
  return current.code === 'MXN' && !text.includes('MX') ? `${text} MXN` : text
}
