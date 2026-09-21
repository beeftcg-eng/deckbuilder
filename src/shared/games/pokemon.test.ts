import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAllPokemonCards, pokemonAdapter } from './pokemon'
import type { PokemonFetchOptions } from './pokemon'
import type { Card } from '../types'

const STATIC = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'
const noWait = async () => {}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const fail = (code: number) => new Response('', { status: code })

const sets = [
  { id: 'base1', name: 'Base', ptcgoCode: 'BS', releaseDate: '1999/01/09', total: 2 },
  { id: 'sv1', name: 'Scarlet & Violet', ptcgoCode: 'SVI', releaseDate: '2023/03/31', total: 3 },
  { id: 'noco', name: 'Ghost set', releaseDate: '2024/01/01', total: 1 },
]
const files: Record<string, unknown> = {
  base1: [
    { id: 'base1-1', name: 'Alakazam', supertype: 'Pokémon', number: '1', rarity: 'Rare Holo', types: ['Psychic'], images: { small: 's1', large: 'l1' }, legalities: { unlimited: 'Legal' }, attacks: [{ name: 'Confuse Ray', text: 'Flip a coin.' }] },
    { id: 'base1-2', name: 'Blastoise', supertype: 'Pokémon', number: '2', rarity: 'Rare Holo', images: { small: 's2', large: 'l2' } },
  ],
  sv1: [
    { id: 'sv1-1', name: 'Sprigatito', supertype: 'Pokémon', number: '1', rarity: 'Common', legalities: { standard: 'Legal', expanded: 'Legal', unlimited: 'Legal' } },
    { id: 'sv1-2', name: 'Floragato', supertype: 'Pokémon', number: '2', rarity: 'Uncommon', legalities: { standard: 'Legal' } },
    { id: 'sv1-3', name: "Professor's Research", supertype: 'Trainer', number: '3', rarity: 'Uncommon', rules: ['Discard your hand.'], legalities: { standard: 'Legal' } },
  ],
}
const priceRows = (ids: string[]) => ids.map((id, i) => ({ id, tcgplayer: { prices: { normal: { market: i + 0.5 }, holofoil: { market: i + 5 } } } }))

/** A fake network. `api` handles the price API; the static files answer from `files` (`failures` fails a URL that many times first). */
function network(opts: { failures?: Record<string, number>; api?: (url: string) => Response } = {}) {
  const attempts = new Map<string, number>()
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const n = (attempts.get(url) ?? 0) + 1
    attempts.set(url, n)
    if ((opts.failures?.[url] ?? 0) >= n) return fail(500)
    if (url === `${STATIC}/sets/en.json`) return json(sets)
    const match = /cards\/en\/([^/]+)\.json$/.exec(url)
    if (match) return match[1] in files ? json(files[match[1]]) : fail(404)
    if (url.startsWith('https://api.pokemontcg.io/v2/cards')) return opts.api ? opts.api(url) : fail(500)
    return fail(404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, attempts }
}
const run = (options: PokemonFetchOptions = { sleep: noWait, priceBudgetMs: 5000 }, progress: { loaded: number; total: number }[] = []) =>
  fetchAllPokemonCards((p) => progress.push(p), options) as Promise<Card[]>
afterEach(() => vi.unstubAllGlobals())

describe('Pokémon sync', () => {
  it('builds cards from the static files: newest set first, real set names, and per-format legality', async () => {
    network()
    const cards = await run()
    expect(cards.map((c) => c.sourceId)).toEqual(['sv1-1', 'sv1-2', 'sv1-3', 'base1-1', 'base1-2']) // the ghost set (no file) is skipped
    const alakazam = cards.find((c) => c.sourceId === 'base1-1')!
    expect(alakazam).toMatchObject({ id: 'pokemon:base1-1', gameId: 'pokemon', setId: 'base1', setName: 'Base', setCode: 'BS', category: 'Pokémon', colors: ['Psychic'], rarity: 'Rare Holo', imageUrl: 'l1', imageUrlSmall: 's1' })
    expect(alakazam.legality).toEqual({ unlimited: 'legal' })
    expect(alakazam.text).toContain('Confuse Ray: Flip a coin.')
    expect(cards.find((c) => c.sourceId === 'sv1-1')!.legality).toEqual({ standard: 'legal', expanded: 'legal', unlimited: 'legal' })
    expect(cards.find((c) => c.sourceId === 'base1-2')!.legality).toEqual({}) // no legality data: legal nowhere
    expect(cards.find((c) => c.sourceId === 'sv1-3')!.text).toBe('Discard your hand.')
  })

  it('reports progress up to the total number of cards', async () => {
    network()
    const progress: { loaded: number; total: number }[] = []
    await run({ sleep: noWait, priceBudgetMs: 5000 }, progress)
    expect(progress[0]).toEqual({ loaded: 0, total: 0 })
    expect(progress.at(-1)).toEqual({ loaded: 5, total: 6 }) // 6 = the sets' declared totals (incl. the ghost set's 1)
    expect(progress.every((p, i) => i === 0 || p.loaded >= progress[i - 1].loaded)).toBe(true)
  })

  it('keeps going through random 500s, which is what used to kill the sync', async () => {
    const { attempts } = network({ failures: { [`${STATIC}/sets/en.json`]: 2, [`${STATIC}/cards/en/sv1.json`]: 3 } })
    const cards = await run()
    expect(cards).toHaveLength(5)
    expect(attempts.get(`${STATIC}/cards/en/sv1.json`)).toBe(4)
  })

  it('takes the cheapest listed price from the API when it answers', async () => {
    network({
      api: (url) => {
        const page = Number(new URL(url).searchParams.get('page'))
        return page === 1 ? json({ data: priceRows(['sv1-1', 'base1-1']), totalCount: 2 }) : json({ data: [], totalCount: 2 })
      },
    })
    const cards = await run()
    expect(cards.find((c) => c.sourceId === 'sv1-1')!.price).toBe(0.5)
    expect(cards.find((c) => c.sourceId === 'base1-1')!.price).toBe(1.5)
    expect(cards.find((c) => c.sourceId === 'sv1-2')!.price).toBeNull()
  })

  it('still succeeds, just without prices, when the price API is down', async () => {
    const { fetchMock } = network({ api: () => fail(500) })
    const cards = await run()
    expect(cards).toHaveLength(5)
    expect(cards.every((c) => c.price === null)).toBe(true)
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith('https://api.pokemontcg.io')).length).toBeLessThanOrEqual(3) // gave up quickly, not 83 pages × retries
  })

  it('stops asking for prices once its time budget is spent', async () => {
    network({ api: (url) => (new URL(url).searchParams.get('page') === '1' ? json({ data: priceRows(['sv1-1']), totalCount: 100000 }) : fail(500)) })
    const started = Date.now()
    const cards = await run({ sleep: noWait, priceBudgetMs: 60 })
    expect(Date.now() - started).toBeLessThan(2000)
    expect(cards.find((c) => c.sourceId === 'sv1-1')!.price).toBe(0.5) // what arrived in time is kept
  })

  it('fails clearly when the card index itself cannot be fetched', async () => {
    network({ failures: { [`${STATIC}/sets/en.json`]: 99 } })
    await expect(run()).rejects.toThrow(/500/)
  })
})

describe('Pokémon adapter', () => {
  it('keeps known prices when a sync could not fetch them', () => {
    expect(pokemonAdapter.keepPricesWhenMissing).toBe(true)
    expect(pokemonAdapter.hasPrices).toBe(true)
  })
})
