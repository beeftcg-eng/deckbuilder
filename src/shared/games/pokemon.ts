import type { Card, DeckRules, Deck, Format } from '../types'
import type { GameAdapter, FetchProgress } from './types'
import { HttpError, fetchJsonWithRetry, mapPool, sleep } from './fetchUtil'

// Cards come from the community's static dataset (github.com/PokemonTCG/pokemon-tcg-data): one small JSON file per
// set on GitHub's CDN — about a minute for all ~20k cards, and it doesn't fail at random. The pokemontcg.io API
// serves the same cards but takes 7–28 s per page (83 pages) and answers 500/502 at random under load, which is
// why a sync that depended on it never finished. The API is still used, but only for prices, which the static
// data doesn't have, and only as far as it cooperates (see fetchPrices).
const STATIC_BASE = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'
const API_BASE = 'https://api.pokemontcg.io/v2/cards'
const SET_CONCURRENCY = 8
const PRICE_PAGE_SIZE = 250
const PRICE_CONCURRENCY = 3
const PRICE_BUDGET_MS = 45_000

interface PokemonSetInfo {
  id: string
  name: string
  ptcgoCode?: string
}

interface PokemonStaticSet extends PokemonSetInfo {
  releaseDate: string
  total: number
}

interface PokemonCardData {
  id: string
  name: string
  supertype: string
  subtypes?: string[]
  types?: string[]
  number: string
  rarity?: string
  images?: { small?: string; large?: string }
  legalities?: Record<string, string>
  attacks?: { name: string; text?: string }[]
  abilities?: { name: string; text?: string }[]
  rules?: string[]
  flavorText?: string
  tcgplayer?: { prices?: Record<string, { market?: number | null; mid?: number | null } | undefined> }
}

interface PokemonPriceResponse {
  data: PokemonCardData[]
  totalCount: number
}

// TCGplayer lists a price per finish (normal, holofoil, reverseHolofoil, ...).
// The cheapest one is what it costs to own the card at all, so that's the price used.
function cheapestPrice(raw: PokemonCardData): number | null {
  const prices = Object.values(raw.tcgplayer?.prices ?? {})
    .map((p) => p?.market ?? p?.mid ?? null)
    .filter((n): n is number => n != null && n > 0)
  return prices.length ? Math.min(...prices) : null
}

function normalizeCard(raw: PokemonCardData, set: PokemonSetInfo): Card {
  const textParts: string[] = []
  if (raw.rules) textParts.push(...raw.rules)
  if (raw.abilities) for (const a of raw.abilities) textParts.push(`${a.name}: ${a.text ?? ''}`)
  if (raw.attacks) for (const a of raw.attacks) textParts.push(`${a.name}: ${a.text ?? ''}`)

  const legality: Record<string, 'legal'> = {}
  if (raw.legalities) {
    for (const [format, status] of Object.entries(raw.legalities)) {
      if (status === 'Legal') legality[format] = 'legal'
    }
  }

  return {
    id: `pokemon:${raw.id}`,
    gameId: 'pokemon',
    sourceId: raw.id,
    name: raw.name,
    imageUrl: raw.images?.large ?? null,
    imageUrlSmall: raw.images?.small ?? null,
    orientation: 'portrait',
    setId: set.id,
    setName: set.name,
    setCode: set.ptcgoCode ?? set.id.toUpperCase(),
    number: raw.number,
    rarity: raw.rarity ?? null,
    category: raw.supertype,
    subtypes: raw.subtypes ?? [],
    colors: raw.types ?? [],
    cost: null,
    text: textParts.length ? textParts.join('\n') : (raw.flavorText ?? null),
    legality,
    price: null,
  }
}

/**
 * Prices from the API, as many as it will give within a time budget. Never throws: a page it won't serve is simply
 * skipped and those cards stay unpriced (a later sync keeps any price it already knew — see cardData.ts).
 */
async function fetchPrices(sleepFn: (ms: number) => Promise<void>, budgetMs: number): Promise<Map<string, number>> {
  const prices = new Map<string, number>()
  const deadline = Date.now() + budgetMs
  const fetchPage = async (page: number): Promise<PokemonPriceResponse | null> => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) return null
    try {
      return await fetchJsonWithRetry<PokemonPriceResponse>(`${API_BASE}?page=${page}&pageSize=${PRICE_PAGE_SIZE}&select=id,tcgplayer`, {
        attempts: 3,
        timeoutMs: Math.min(20_000, remaining),
        sleep: sleepFn,
      })
    } catch {
      return null
    }
  }
  const collect = (response: PokemonPriceResponse) => {
    for (const card of response.data) {
      const price = cheapestPrice(card)
      if (price != null) prices.set(card.id, price)
    }
  }

  const first = await fetchPage(1)
  if (!first) return prices
  collect(first)
  const pages = Math.ceil(first.totalCount / PRICE_PAGE_SIZE)
  let next = 2
  await Promise.all(
    Array.from({ length: PRICE_CONCURRENCY }, async () => {
      while (next <= pages && Date.now() < deadline) {
        const response = await fetchPage(next++)
        if (response) collect(response)
      }
    }),
  )
  return prices
}

export interface PokemonFetchOptions {
  /** Injectable so tests don't really wait between retries. */
  sleep?: (ms: number) => Promise<void>
  priceBudgetMs?: number
}

export async function fetchAllPokemonCards(onProgress: (p: FetchProgress) => void, options: PokemonFetchOptions = {}): Promise<Card[]> {
  const sleepFn = options.sleep ?? sleep
  onProgress({ loaded: 0, total: 0 })

  const sets = await fetchJsonWithRetry<PokemonStaticSet[]>(`${STATIC_BASE}/sets/en.json`, { sleep: sleepFn })
  // Newest set first, so recent cards lead the browser.
  const ordered = [...sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
  const total = ordered.reduce((sum, set) => sum + set.total, 0)

  let loaded = 0
  const perSet = await mapPool(ordered, SET_CONCURRENCY, async (set) => {
    try {
      const raw = await fetchJsonWithRetry<PokemonCardData[]>(`${STATIC_BASE}/cards/en/${encodeURIComponent(set.id)}.json`, { sleep: sleepFn })
      loaded += raw.length
      onProgress({ loaded, total: Math.max(total, loaded) })
      return raw.map((card) => normalizeCard(card, set))
    } catch (err) {
      // A set listed in the index but with no card file (the dataset is community-maintained) shouldn't sink the sync.
      if (err instanceof HttpError && err.status === 404) return []
      throw err
    }
  })
  const cards = perSet.flat()
  if (cards.length === 0) throw new Error('The Pokémon card data came back empty')

  const prices = await fetchPrices(sleepFn, options.priceBudgetMs ?? PRICE_BUDGET_MS)
  return prices.size === 0 ? cards : cards.map((card) => (prices.has(card.sourceId) ? { ...card, price: prices.get(card.sourceId)! } : card))
}

const deckRules: DeckRules = {
  defaultMaxCopiesPerCard: 4,
  colorLocked: false,
  zones: [
    {
      id: 'main',
      label: 'Deck',
      match: () => true,
      exactCount: 60,
    },
  ],
}

const defaultFormats: Format[] = [
  { id: 'standard', label: 'Standard', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] },
  { id: 'expanded', label: 'Expanded', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] },
  { id: 'unlimited', label: 'Unlimited', bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] },
]

function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const entries = deck.zones.main ?? []
  const groups: Record<string, { card: Card; quantity: number }[]> = {
    Pokémon: [],
    Trainer: [],
    Energy: [],
  }

  let total = 0
  for (const entry of entries) {
    const card = cardsById.get(entry.cardId)
    if (!card) continue
    const bucket = groups[card.category] ?? groups.Trainer
    bucket.push({ card, quantity: entry.quantity })
    total += entry.quantity
  }

  const lines: string[] = []
  for (const [label, list] of Object.entries(groups)) {
    if (list.length === 0) continue
    const count = list.reduce((sum, e) => sum + e.quantity, 0)
    lines.push(`${label}: ${count}`)
    for (const { card, quantity } of list.sort((a, b) => a.card.name.localeCompare(b.card.name))) {
      lines.push(`${quantity} ${card.name} ${card.setCode} ${card.number}`)
    }
    lines.push('')
  }
  lines.push(`Total Cards: ${total}`)

  return lines.join('\n')
}

export const pokemonAdapter: GameAdapter = {
  id: 'pokemon',
  typeOrder: ['Pokémon', 'Trainer', 'Energy'],
  filterKinds: ['Basic', 'Stage 1', 'Stage 2', 'ex', 'V', 'VSTAR', 'VMAX', 'Item', 'Supporter', 'Stadium', 'Pokémon Tool', 'ACE SPEC', 'Special'],
  name: 'Pokémon Trading Card Game',
  shortName: 'Pokémon',
  deckRules,
  defaultFormats,
  legalitySource: 'api',
  hasPrices: true,
  keepPricesWhenMissing: true,
  openingHandSize: 7,
  fetchAllCards: (onProgress) => fetchAllPokemonCards(onProgress),
  formatDecklistText,
  copyLimitFor: (card) => (card.category === 'Energy' && card.subtypes.includes('Basic') ? Infinity : null),
}
