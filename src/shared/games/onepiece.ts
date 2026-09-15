import type { Card, DeckRules, Deck, Format } from '../types'
import type { GameAdapter, FetchProgress, GuidedStage } from './types'
import { fetchJson } from './fetchUtil'

const API_BASE = 'https://www.optcgapi.com/api'

interface OnePieceApiCard {
  card_name: string
  set_name: string
  card_text: string | null
  set_id: string
  rarity: string | null
  card_set_id: string
  card_color: string | null
  card_type: string
  life: string | null
  card_cost: string | null
  card_power: string | null
  sub_types: string | null
  counter_amount: number | null
  attribute: string | null
  card_image: string | null
}

interface OnePieceSet {
  set_name: string
  set_id: string
}

function normalizeCard(raw: OnePieceApiCard): Card {
  const number = raw.card_set_id.includes('-')
    ? raw.card_set_id.slice(raw.card_set_id.lastIndexOf('-') + 1)
    : raw.card_set_id

  const infoParts: string[] = []
  if (raw.card_power) infoParts.push(`Power: ${raw.card_power}`)
  if (raw.life) infoParts.push(`Life: ${raw.life}`)
  if (raw.counter_amount) infoParts.push(`Counter: ${raw.counter_amount}`)
  if (raw.attribute) infoParts.push(`Attribute: ${raw.attribute}`)
  if (raw.card_text) infoParts.push(raw.card_text)

  return {
    id: `onepiece:${raw.card_set_id}`,
    gameId: 'onepiece',
    sourceId: raw.card_set_id,
    name: raw.card_name,
    imageUrl: raw.card_image,
    imageUrlSmall: raw.card_image,
    orientation: 'portrait',
    setId: raw.set_id,
    setName: raw.set_name,
    setCode: raw.set_id,
    number,
    rarity: raw.rarity,
    category: raw.card_type,
    subtypes: raw.sub_types ? [raw.sub_types] : [],
    colors: raw.card_color ? raw.card_color.split('/').map((c) => c.trim()) : [],
    cost: raw.card_cost,
    text: infoParts.length ? infoParts.join('\n') : null,
    legality: null,
  }
}

async function fetchAllCards(onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  const sets = await fetchJson<OnePieceSet[]>(`${API_BASE}/allSets/`)
  const cards: Card[] = []

  let setsLoaded = 0
  for (const set of sets) {
    const raw = await fetchJson<OnePieceApiCard[]>(`${API_BASE}/sets/${encodeURIComponent(set.set_id)}/`)
    for (const c of raw) cards.push(normalizeCard(c))
    setsLoaded += 1
    onProgress({ loaded: setsLoaded, total: sets.length })
  }

  return cards
}

const deckRules: DeckRules = {
  defaultMaxCopiesPerCard: 4,
  colorLocked: true,
  identityZoneId: 'leader',
  zones: [
    {
      id: 'leader',
      label: 'Leader',
      match: (card) => card.category === 'Leader',
      exactCount: 1,
      maxCopiesPerCard: 1,
    },
    {
      id: 'main',
      label: 'Main Deck',
      match: (card) => card.category !== 'Leader',
      exactCount: 50,
    },
  ],
}

const defaultFormats: Format[] = [
  {
    id: 'standard',
    label: 'Standard (current rotation + ban list)',
    description:
      'Block 2 onward (OP-05 and later) as of the April 2026 rotation, which retired Block 1 (OP-01–OP-04). Also applies the current official banned/restricted list as a snapshot from onepiece.gg. Bandai rotates the legal block window each April 1st (next: April 2027) — re-check onepiece.gg periodically, neither list is auto-updated.',
    legalSetIds: [
      'EB-01',
      'EB-02',
      'EB-03',
      'OP-05',
      'OP-06',
      'OP-07',
      'OP-08',
      'OP-09',
      'OP-10',
      'OP-11',
      'OP-12',
      'OP-13',
      'OP-16',
      'OP-17',
      'OP14-EB04',
      'OP15-EB04',
      'PRB-01',
      'PRB-02',
    ],
    bannedCardIds: ['onepiece:OP06-116', 'onepiece:ST10-001', 'onepiece:OP06-086', 'onepiece:OP03-040', 'onepiece:OP06-047'],
    restrictedCardIds: [],
    bannedPairs: [
      ['onepiece:EB04-058', 'onepiece:OP07-115'],
      ['onepiece:OP11-040', 'onepiece:OP11-067'],
      ['onepiece:OP11-040', 'onepiece:OP08-069'],
    ],
  },
  {
    id: 'unrestricted',
    label: 'All Sets (no ban list)',
    bannedCardIds: [],
    restrictedCardIds: [],
    bannedPairs: [],
  },
]

function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const lines: string[] = []
  const leaderEntry = (deck.zones.leader ?? [])[0]
  const leaderCard = leaderEntry ? cardsById.get(leaderEntry.cardId) : undefined

  lines.push(`Leader: ${leaderCard ? `${leaderCard.sourceId} ${leaderCard.name}` : '(none selected)'}`)
  lines.push('')

  const mainEntries = deck.zones.main ?? []
  const total = mainEntries.reduce((sum, e) => sum + e.quantity, 0)
  lines.push(`Main Deck (${total}/50):`)
  for (const entry of mainEntries) {
    const card = cardsById.get(entry.cardId)
    if (!card) continue
    lines.push(`${entry.quantity}x ${card.sourceId} ${card.name}`)
  }
  lines.push('')
  lines.push('DON!!: 10 (standard)')

  return lines.join('\n')
}

function getGuidedStage(deck: Deck): GuidedStage | null {
  const hasLeader = (deck.zones.leader ?? []).length > 0
  if (!hasLeader) {
    return { label: 'Pick your Leader', filter: (card) => card.category === 'Leader', targetZoneId: 'leader' }
  }
  return null
}

export const onepieceAdapter: GameAdapter = {
  id: 'onepiece',
  name: 'One Piece Card Game',
  shortName: 'One Piece',
  deckRules,
  defaultFormats,
  fetchAllCards,
  formatDecklistText,
  getGuidedStage,
  mainDeckExcludedCategories: ['Leader', 'DON!!'],
}
