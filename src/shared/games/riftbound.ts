import type { Card, DeckRules, Deck, Format } from '../types'
import type { GameAdapter, FetchProgress } from './types'
import { fetchJson } from './fetchUtil'

const API_BASE = 'https://api.riftcodex.com/cards'
const PAGE_SIZE = 100

export const RUNE_DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order'] as const

interface RiftboundApiCard {
  id: string
  name: string
  riftbound_id: string
  collector_number: number
  classification: { type: string; supertype: string | null; rarity: string | null; domain: string[] }
  text: { plain: string | null }
  set: { set_id: string; label: string }
  media: { image_url: string | null }
  attributes: { energy: number | null }
}

interface RiftboundApiResponse {
  items: RiftboundApiCard[]
  total: number
  page: number
  size: number
  pages: number
}

function normalizeCard(raw: RiftboundApiCard): Card {
  return {
    id: `riftbound:${raw.id}`,
    gameId: 'riftbound',
    sourceId: raw.riftbound_id,
    name: raw.name,
    imageUrl: raw.media.image_url,
    imageUrlSmall: raw.media.image_url,
    setId: raw.set.set_id,
    setName: raw.set.label,
    setCode: raw.set.set_id.toUpperCase(),
    number: String(raw.collector_number),
    rarity: raw.classification.rarity,
    category: raw.classification.type,
    subtypes: raw.classification.supertype ? [raw.classification.supertype] : [],
    colors: raw.classification.domain ?? [],
    cost: raw.attributes.energy != null ? String(raw.attributes.energy) : null,
    text: raw.text.plain,
    legality: null,
  }
}

async function fetchAllCards(onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  const cards: Card[] = []
  let page = 1
  let pages = 1

  do {
    const url = `${API_BASE}?size=${PAGE_SIZE}&page=${page}`
    const res = await fetchJson<RiftboundApiResponse>(url)
    pages = res.pages
    for (const raw of res.items) cards.push(normalizeCard(raw))
    onProgress({ loaded: cards.length, total: res.total })
    page += 1
  } while (page <= pages)

  return cards
}

const deckRules: DeckRules = {
  defaultMaxCopiesPerCard: 3,
  colorLocked: true,
  identityZoneId: 'legend',
  zones: [
    {
      id: 'legend',
      label: 'Legend',
      match: (card) => card.category === 'Legend',
      exactCount: 1,
      maxCopiesPerCard: 1,
    },
    {
      id: 'main',
      label: 'Main Deck',
      match: (card) => card.category !== 'Legend' && card.category !== 'Battlefield',
      exactCount: 40,
    },
    {
      id: 'battlefields',
      label: 'Battlefields',
      match: (card) => card.category === 'Battlefield',
      exactCount: 3,
      maxCopiesPerCard: 1,
      uniqueNames: true,
    },
    {
      id: 'sideboard',
      label: 'Sideboard',
      match: (card) => card.category !== 'Legend' && card.category !== 'Battlefield',
      allowedCounts: [0, 8],
    },
    {
      id: 'runes',
      label: 'Rune Deck',
      match: () => false,
      exactCount: 12,
      freeText: { options: [...RUNE_DOMAINS] },
    },
  ],
}

const defaultFormats: Format[] = [
  {
    id: 'constructed',
    label: 'Constructed',
    description:
      'Riftbound launched in late 2025 and has no official ban list yet. This will need updating here if Riot/Riftbound Organized Play ever publishes one.',
    bannedCardIds: [],
    restrictedCardIds: [],
    bannedPairs: [],
  },
]

function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const lines: string[] = []

  const legendEntry = (deck.zones.legend ?? [])[0]
  const legendCard = legendEntry ? cardsById.get(legendEntry.cardId) : undefined
  lines.push(`Legend: ${legendCard ? `${legendCard.sourceId} ${legendCard.name}` : '(none selected)'}`)
  lines.push('')

  const mainEntries = deck.zones.main ?? []
  const mainTotal = mainEntries.reduce((sum, e) => sum + e.quantity, 0)
  lines.push(`Main Deck (${mainTotal}/40):`)
  for (const entry of mainEntries) {
    const card = cardsById.get(entry.cardId)
    if (!card) continue
    lines.push(`${entry.quantity}x ${card.sourceId} ${card.name}`)
  }
  lines.push('')

  const runes = deck.freeTextZones.runes ?? []
  const runeTotal = runes.reduce((sum, e) => sum + e.quantity, 0)
  lines.push(`Runes (${runeTotal}/12):`)
  for (const r of runes) lines.push(`${r.quantity}x ${r.label}`)
  lines.push('')

  const battlefields = deck.zones.battlefields ?? []
  lines.push(`Battlefields (${battlefields.length}/3):`)
  for (const entry of battlefields) {
    const card = cardsById.get(entry.cardId)
    if (!card) continue
    lines.push(`1x ${card.sourceId} ${card.name}`)
  }

  const sideboard = deck.zones.sideboard ?? []
  if (sideboard.length > 0) {
    lines.push('')
    const sideTotal = sideboard.reduce((sum, e) => sum + e.quantity, 0)
    lines.push(`Sideboard (${sideTotal}/8):`)
    for (const entry of sideboard) {
      const card = cardsById.get(entry.cardId)
      if (!card) continue
      lines.push(`${entry.quantity}x ${card.sourceId} ${card.name}`)
    }
  }

  return lines.join('\n')
}

export const riftboundAdapter: GameAdapter = {
  id: 'riftbound',
  name: 'Riftbound: League of Legends TCG',
  shortName: 'Riftbound',
  deckRules,
  defaultFormats,
  fetchAllCards,
  formatDecklistText,
}
