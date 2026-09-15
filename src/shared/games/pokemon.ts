import type { Card, DeckRules, Deck, Format } from '../types'
import type { GameAdapter, FetchProgress } from './types'
import { fetchJson, sleep } from './fetchUtil'

const API_BASE = 'https://api.pokemontcg.io/v2/cards'
const PAGE_SIZE = 250

interface PokemonApiCard {
  id: string
  name: string
  supertype: string
  subtypes?: string[]
  types?: string[]
  number: string
  rarity?: string
  set: { id: string; name: string; ptcgoCode?: string }
  images?: { small?: string; large?: string }
  legalities?: Record<string, string>
  attacks?: { name: string; text?: string }[]
  abilities?: { name: string; text?: string }[]
  rules?: string[]
  flavorText?: string
}

interface PokemonApiResponse {
  data: PokemonApiCard[]
  page: number
  pageSize: number
  count: number
  totalCount: number
}

function normalizeCard(raw: PokemonApiCard): Card {
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
    setId: raw.set.id,
    setName: raw.set.name,
    setCode: raw.set.ptcgoCode ?? raw.set.id.toUpperCase(),
    number: raw.number,
    rarity: raw.rarity ?? null,
    category: raw.supertype,
    subtypes: raw.subtypes ?? [],
    colors: raw.types ?? [],
    cost: null,
    text: textParts.length ? textParts.join('\n') : (raw.flavorText ?? null),
    legality,
  }
}

async function fetchAllCards(onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  const cards: Card[] = []
  let page = 1
  let total = PAGE_SIZE

  while (true) {
    const url = `${API_BASE}?page=${page}&pageSize=${PAGE_SIZE}`
    const res = await fetchJson<PokemonApiResponse>(url)
    total = res.totalCount
    for (const raw of res.data) cards.push(normalizeCard(raw))
    onProgress({ loaded: cards.length, total })

    if (res.data.length < PAGE_SIZE || cards.length >= total) break
    page += 1
    await sleep(300)
  }

  return cards
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
  name: 'Pokémon Trading Card Game',
  shortName: 'Pokémon',
  deckRules,
  defaultFormats,
  fetchAllCards,
  formatDecklistText,
}
