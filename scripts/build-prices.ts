/**
 * Writes the day's USD exchange rates (<out>/rates.json) and TCGplayer market prices for the games whose own card sources lack them (Riftbound: none;
 * Pokémon and Yu-Gi-Oh!: patchy) to <out>/<game>.json, from tcgcsv.com's daily dump of TCGplayer's
 * catalog. Run by .github/workflows/deploy-pwa.yml when the phone app is deployed (and daily), so the
 * files sit on the phone app's own site: tcgcsv doesn't allow a web page to read it directly.
 *
 *   node --experimental-strip-types scripts/build-prices.ts dist-web/prices
 *
 * A game that fails is skipped with a warning rather than failing the deploy; the apps then keep the
 * prices they already had.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pokemonKey, pokemonPromoKey, riftboundKey, splitYugiohCode, yugiohExactKey, yugiohKey, type PriceFile } from '../src/shared/priceKeys.ts'

const BASE = 'https://tcgcsv.com/tcgplayer'
const CATEGORY = { riftbound: 89, pokemon: 3, yugioh: 2 } as const
const CONCURRENCY = 6

interface Group {
  groupId: number
  name: string
  abbreviation?: string | null
}
interface PriceRow {
  productId: number
  marketPrice: number | null
  midPrice: number | null
  lowPrice: number | null
}
interface Product {
  productId: number
  name: string
  extendedData?: { name: string; value: string }[]
}

async function getJson<T>(url: string, attempt = 1): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': 'BeefsBrewhouse-prices/1.0 (github.com/beeftcg-eng/deckbuilder)' } })
  if (res.ok) return (await res.json()) as T
  if (attempt < 4 && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 1000 * attempt))
    return getJson<T>(url, attempt + 1)
  }
  throw new Error(`${res.status} ${url}`)
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

/** The cheapest way to own each product (a card's Normal / Foil / 1st Edition rows), by product id. */
async function groupPrices(category: number, groupId: number): Promise<Map<number, number>> {
  const rows = (await getJson<{ results: PriceRow[] }>(`${BASE}/${category}/${groupId}/prices`)).results
  const out = new Map<number, number>()
  for (const r of rows) {
    const price = r.marketPrice ?? r.midPrice ?? r.lowPrice
    if (price == null || price <= 0) continue
    const had = out.get(r.productId)
    if (had == null || price < had) out.set(r.productId, price)
  }
  return out
}

async function groupsOf(category: number): Promise<Group[]> {
  return (await getJson<{ results: Group[] }>(`${BASE}/${category}/groups`)).results
}

function extended(p: Product, name: string): string | undefined {
  return p.extendedData?.find((e) => e.name === name)?.value
}

function keep(prices: Record<string, number>, key: string, price: number) {
  if (prices[key] == null || price < prices[key]) prices[key] = Math.round(price * 100) / 100
}

async function riftbound(): Promise<Record<string, number>> {
  // Riftbound's card data carries each card's TCGplayer product id; set + printed number covers the
  // cards it doesn't have one for yet (a brand-new set).
  const prices = await byProductList(CATEGORY.riftbound, (group, p) => {
    const number = extended(p, 'Number')
    return group.abbreviation && number ? [riftboundKey(group.abbreviation, number)] : []
  })
  for (const byProduct of await mapPool(await groupsOf(CATEGORY.riftbound), CONCURRENCY, (g) => groupPrices(CATEGORY.riftbound, g.groupId))) {
    for (const [id, price] of byProduct) keep(prices, String(id), price)
  }
  return prices
}

async function byProductList(category: number, keysOf: (group: Group, product: Product) => string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}
  const groups = await groupsOf(category)
  await mapPool(groups, CONCURRENCY, async (group) => {
    try {
      const [products, byProduct] = await Promise.all([getJson<{ results: Product[] }>(`${BASE}/${category}/${group.groupId}/products`), groupPrices(category, group.groupId)])
      for (const p of products.results) {
        const price = byProduct.get(p.productId)
        if (price == null) continue
        for (const key of keysOf(group, p)) keep(prices, key, price)
      }
    } catch (err) {
      console.warn(`skipped group ${group.name}: ${err instanceof Error ? err.message : err}`)
    }
  })
  return prices
}

const pokemon = () =>
  byProductList(CATEGORY.pokemon, (group, p) => {
    const number = extended(p, 'Number')
    if (!group.abbreviation || !number) return []
    // Recent sets' abbreviations are the card data's set codes ("JTG"); older ones are its set ids ("SWSH08", "SM12", "SWSH12: TG").
    const plain = group.abbreviation.replace(/[^A-Za-z0-9]/g, '')
    const keys = [pokemonKey(group.abbreviation, number), pokemonKey(plain, number)]
    const promo = /promo/i.test(group.name) ? pokemonPromoKey(number) : null
    if (promo) keys.push(promo)
    return [...new Set(keys)]
  })

const yugioh = () =>
  byProductList(CATEGORY.yugioh, (_group, p) => {
    const split = splitYugiohCode(extended(p, 'Number') ?? '')
    if (!split) return []
    const rarity = extended(p, 'Rarity')
    return [yugiohKey(split[0], split[1]), yugiohExactKey(split[0], split[1]), ...(rarity ? [yugiohKey(split[0], split[1], rarity), yugiohExactKey(split[0], split[1], rarity)] : [])]
  })

/** Exchange rates for showing prices in other currencies (European Central Bank, via frankfurter.dev). */
async function rates(): Promise<Record<string, number>> {
  const res = await getJson<{ rates: Record<string, number> }>('https://api.frankfurter.dev/v1/latest?from=USD')
  return res.rates
}

const out = process.argv[2] ?? 'dist-web/prices'
await mkdir(out, { recursive: true })
try {
  const r = await rates()
  if (!Object.keys(r).length) throw new Error('no rates')
  await writeFile(join(out, 'rates.json'), JSON.stringify({ updatedAt: new Date().toISOString(), base: 'USD', rates: r }))
  console.log(`rates: ${Object.keys(r).length} currencies`)
} catch (err) {
  console.warn(`::warning::exchange rates skipped: ${err instanceof Error ? err.message : err}`)
}
for (const [game, build] of Object.entries({ riftbound, pokemon, yugioh })) {
  try {
    const prices = await build()
    const count = Object.keys(prices).length
    if (!count) throw new Error('no prices')
    const file: PriceFile = { updatedAt: new Date().toISOString(), prices }
    await writeFile(join(out, `${game}.json`), JSON.stringify(file))
    console.log(`${game}: ${count} prices`)
  } catch (err) {
    console.warn(`::warning::${game} prices skipped: ${err instanceof Error ? err.message : err}`)
  }
}
