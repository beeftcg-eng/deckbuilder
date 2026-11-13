/**
 * The daily check that every outside source the apps read still answers the way they expect. Run by
 * .github/workflows/deploy-pwa.yml after the steps that publish files (prices, Community lists, ban
 * lists), which record how their own sources went in <dir>/<source>.json (scripts/health.ts). This
 * adds a light probe of each card-data source, then writes <dir>/report.json: one row per source, ok
 * or not, which the workflow turns into one GitHub issue per broken source (closed again when it
 * reads). The apps themselves never depend on this: it's how a change at a source gets noticed
 * before the bug reports do.
 *
 *   npx rolldown scripts/check-sources.ts --platform node --format esm -o .health/check-sources.mjs
 *   node .health/check-sources.mjs .health
 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { recordHealth, type HealthRow } from './health.ts'

interface Probe {
  source: string
  url: string
  /** What the body must look like; returns a problem, or null when it's fine. */
  check: (body: unknown) => string | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const nonEmptyArray = (v: unknown, what: string) => (Array.isArray(v) && v.length > 0 ? null : `${what} is empty or not a list`)

const PROBES: Probe[] = [
  { source: 'Riftbound card data (riftcodex)', url: 'https://api.riftcodex.com/sets?size=100', check: (b) => (isObj(b) ? nonEmptyArray(b.items, 'items') : 'not an object') },
  { source: 'One Piece card data (optcgapi)', url: 'https://www.optcgapi.com/api/allSets/', check: (b) => nonEmptyArray(b, 'sets') },
  {
    source: 'Pokémon card data (pokemon-tcg-data)',
    url: 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json',
    check: (b) => nonEmptyArray(b, 'sets'),
  },
  {
    source: 'Pokémon prices (pokemontcg.io)',
    url: 'https://api.pokemontcg.io/v2/cards?page=1&pageSize=1&select=id,tcgplayer',
    check: (b) => (isObj(b) ? nonEmptyArray(b.data, 'data') : 'not an object'),
  },
  {
    source: 'Magic card data (Scryfall)',
    url: 'https://api.scryfall.com/bulk-data/default_cards',
    check: (b) => (isObj(b) && typeof b.jsonl_download_uri === 'string' ? null : 'no jsonl_download_uri'),
  },
  {
    source: 'Yu-Gi-Oh! card data (YGOPRODeck)',
    url: 'https://db.ygoprodeck.com/api/v7/checkDBVer.php',
    check: (b) => (Array.isArray(b) && isObj(b[0]) && typeof b[0].database_version === 'string' ? null : 'no database_version'),
  },
  { source: 'TCGplayer prices (tcgcsv)', url: 'https://tcgcsv.com/tcgplayer/categories', check: (b) => (isObj(b) ? nonEmptyArray(b.results, 'results') : 'not an object') },
  { source: 'Exchange rates (frankfurter)', url: 'https://api.frankfurter.dev/v1/latest?from=USD', check: (b) => (isObj(b) && isObj(b.rates) && Object.keys(b.rates).length > 10 ? null : 'too few rates') },
]

async function probe(p: Probe): Promise<HealthRow> {
  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(p.url, { headers: { 'User-Agent': 'BeefsBrewhouse (source check; daily)', Accept: 'application/json' }, signal: AbortSignal.timeout(45_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const problem = p.check(await res.json())
      if (!problem) return { source: p.source, ok: true, detail: '' }
      lastError = problem
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((r) => setTimeout(r, 5000))
  }
  return { source: p.source, ok: false, detail: `${p.url}: ${lastError}` }
}

async function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('Usage: check-sources <health dir>')
  for (const row of await Promise.all(PROBES.map(probe))) await recordHealth(dir, row)
  const rows: HealthRow[] = []
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'report.json').sort()) {
    rows.push(JSON.parse(await readFile(join(dir, name), 'utf8')) as HealthRow)
  }
  await writeFile(join(dir, 'report.json'), JSON.stringify(rows, null, 2))
  for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.source}${r.ok ? '' : ` — ${r.detail}`}`)
}

main().catch((err) => {
  console.error('Source check failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
