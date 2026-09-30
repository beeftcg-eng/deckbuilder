/**
 * Writes the day's USD exchange rates (<out>/rates.json) and TCGplayer market prices for the games whose own card sources lack them (Riftbound: none;
 * Pokémon and Yu-Gi-Oh!: patchy) to <out>/<game>.json, from tcgcsv.com's daily dump of TCGplayer's
 * catalog. Run by .github/workflows/deploy-pwa.yml when the phone app is deployed (and daily), so the
 * files sit on the phone app's own site: tcgcsv doesn't allow a web page to read it directly.
 *
 *   npx rolldown scripts/build-prices.ts --platform node --format esm -o .prices/build-prices.mjs
 *   node .prices/build-prices.mjs dist-web/prices
 *
 * One Piece and Magic already get prices from their own card sources (optcgapi, Scryfall); for them
 * this runs the app's own download code and publishes each card's price by card id, so the apps can
 * refresh prices daily without re-downloading those catalogs (priceRefresh.ts).
 *
 * A game that fails is skipped with a warning rather than failing the deploy; the apps then keep the
 * prices they already had.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pokemonKey, pokemonPromoKey, riftboundKey, splitYugiohCode, yugiohExactKey, yugiohKey, type PriceFile } from '../src/shared/priceKeys.ts'
import { getAdapter } from '../src/shared/games/registry.ts'
import { uniquifyCardIds } from '../src/shared/cardIds.ts'
import { idKey } from '../src/shared/priceRefresh.ts'
import type { GameId } from '../src/shared/types.ts'

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
  /** "Normal", "Foil", "Holofoil", "Reverse Holofoil", "1st Edition"... */
  subTypeName?: string | null
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

/** Regular prices and foil prices, each by key. */
interface Prices {
  prices: Record<string, number>
  foilPrices: Record<string, number>
}

interface ProductPrices {
  /** The cheapest way to own each product (a card's Normal / Foil / 1st Edition rows). */
  any: Map<number, number>
  /** The cheapest foil row (Foil, Holofoil, Reverse Holofoil...), for copies marked foil (copyDetails.ts). */
  foil: Map<number, number>
}

function setLower(map: Map<number, number>, id: number, price: number) {
  const had = map.get(id)
  if (had == null || price < had) map.set(id, price)
}

/** Each product's prices, by product id. */
async function groupPrices(category: number, groupId: number): Promise<ProductPrices> {
  const rows = (await getJson<{ results: PriceRow[] }>(`${BASE}/${category}/${groupId}/prices`)).results
  const out: ProductPrices = { any: new Map(), foil: new Map() }
  for (const r of rows) {
    const price = r.marketPrice ?? r.midPrice ?? r.lowPrice
    if (price == null || price <= 0) continue
    setLower(out.any, r.productId, price)
    if (/foil/i.test(r.subTypeName ?? '')) setLower(out.foil, r.productId, price)
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

async function riftbound(): Promise<Prices> {
  // Riftbound's card data carries each card's TCGplayer product id; set + printed number covers the
  // cards it doesn't have one for yet (a brand-new set).
  const prices = await byProductList(CATEGORY.riftbound, (group, p) => {
    const number = extended(p, 'Number')
    return group.abbreviation && number ? [riftboundKey(group.abbreviation, number)] : []
  })
  for (const byProduct of await mapPool(await groupsOf(CATEGORY.riftbound), CONCURRENCY, (g) => groupPrices(CATEGORY.riftbound, g.groupId))) {
    for (const [id, price] of byProduct.any) keep(prices.prices, String(id), price)
    for (const [id, price] of byProduct.foil) keep(prices.foilPrices, String(id), price)
  }
  return prices
}

async function byProductList(category: number, keysOf: (group: Group, product: Product) => string[]): Promise<Prices> {
  const prices: Prices = { prices: {}, foilPrices: {} }
  const groups = await groupsOf(category)
  await mapPool(groups, CONCURRENCY, async (group) => {
    try {
      const [products, byProduct] = await Promise.all([getJson<{ results: Product[] }>(`${BASE}/${category}/${group.groupId}/products`), groupPrices(category, group.groupId)])
      for (const p of products.results) {
        const price = byProduct.any.get(p.productId)
        if (price == null) continue
        const foil = byProduct.foil.get(p.productId)
        for (const key of keysOf(group, p)) {
          keep(prices.prices, key, price)
          if (foil != null) keep(prices.foilPrices, key, foil)
        }
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

/** Prices from the app's own download of a game (the ids match the app's, uniquified the same way). */
function byCardId(game: GameId): () => Promise<Prices> {
  return async () => {
    const cards = uniquifyCardIds(await getAdapter(game).fetchAllCards(() => {}))
    const prices: Prices = { prices: {}, foilPrices: {} }
    for (const card of cards) {
      if (card.price != null && card.price > 0) prices.prices[idKey(card)] = Math.round(card.price * 100) / 100
      if (card.foilPrice != null && card.foilPrice > 0) prices.foilPrices[idKey(card)] = Math.round(card.foilPrice * 100) / 100
    }
    return prices
  }
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
for (const [game, build] of Object.entries({ riftbound, pokemon, yugioh, onepiece: byCardId('onepiece'), mtg: byCardId('mtg') })) {
  try {
    const { prices, foilPrices } = await build()
    const count = Object.keys(prices).length
    if (!count) throw new Error('no prices')
    const foilCount = Object.keys(foilPrices).length
    const file: PriceFile = { updatedAt: new Date().toISOString(), prices, ...(foilCount ? { foilPrices } : {}) }
    await writeFile(join(out, `${game}.json`), JSON.stringify(file))
    console.log(`${game}: ${count} prices, ${foilCount} foil prices`)
  } catch (err) {
    console.warn(`::warning::${game} prices skipped: ${err instanceof Error ? err.message : err}`)
  }
}
