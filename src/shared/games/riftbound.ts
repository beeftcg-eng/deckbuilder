import type { Card, DeckRules, Deck, Format } from '../types'
import type { GameAdapter, FetchProgress, GuidedStage } from './types'
import { fetchJson } from './fetchUtil'
import { t } from '../i18n'

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
  orientation: 'portrait' | 'landscape'
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
    orientation: raw.orientation === 'landscape' ? 'landscape' : 'portrait',
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
    // riftcodex doesn't expose prices (only a tcgplayer_id), so none are shown for Riftbound.
    price: null,
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
      allowedCounts: [0, 10],
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

// The name Riot's event locator and Piltover Archive look cards up by. riftcodex writes most
// Legend/Champion titles with a dash ("Ahri - Alluring") where they use a comma ("Ahri, Alluring"),
// and names each special printing with a suffix ("(Alternate Art)", "(Overnumbered)", "(Signature)")
// that isn't part of the card's name at all - either one makes the other sites reject the line.
export function riftboundDecklistName(card: Card): string {
  return card.name.replace(/\s*\([^)]*\)\s*$/, '').replace(' - ', ', ')
}

function baseChampionName(name: string): string {
  return name.split(/, | - /)[0].trim().toLowerCase()
}

/**
 * The Champion the export names as the deck's chosen Champion. This app has no separate pick for
 * it (it's just a Champion unit in the Main Deck), but the event locator and Piltover Archive need
 * one listed under its own "Champion:" heading: the one matching the Legend if there is one, else
 * the first Champion in the Main Deck.
 */
function chosenChampionId(deck: Deck, cardsById: Map<string, Card>, legendCard: Card | undefined): string | null {
  const champions = (deck.zones.main ?? []).map((e) => cardsById.get(e.cardId)).filter((c): c is Card => !!c && c.subtypes.includes('Champion'))
  if (champions.length === 0) return null
  const legendBase = legendCard ? baseChampionName(legendCard.name) : null
  return (champions.find((c) => baseChampionName(c.name) === legendBase) ?? champions[0]).id
}

/**
 * "Legend: / Champion: / MainDeck: / Battlefields: / Runes: / Sideboard:" with "3 Name" lines -
 * Piltover Archive's own text export, which is what Riot's event locator (and Piltover Archive's
 * import) read. Headings must be plain words (no "(39/40)" counts), lines must be bare card names
 * (no set codes), and runes are the rune cards' names ("6 Order Rune"). The chosen Champion is
 * listed once under Champion and left out of MainDeck, which is why MainDeck holds 39.
 */
function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const legendEntry = (deck.zones.legend ?? [])[0]
  const legendCard = legendEntry ? cardsById.get(legendEntry.cardId) : undefined
  const championId = chosenChampionId(deck, cardsById, legendCard)

  // A decklist names cards, not printings: an alt-art and a regular copy are one "3 <name>" line.
  const linesFor = (zoneId: string, skipOneOf: string | null = null): string[] => {
    const byName = new Map<string, number>()
    let skipped = false
    for (const entry of deck.zones[zoneId] ?? []) {
      const card = cardsById.get(entry.cardId)
      if (!card) continue
      let quantity = entry.quantity
      if (!skipped && card.id === skipOneOf) {
        quantity -= 1
        skipped = true
      }
      if (quantity <= 0) continue
      const name = riftboundDecklistName(card)
      byName.set(name, (byName.get(name) ?? 0) + quantity)
    }
    return [...byName].map(([name, quantity]) => `${quantity} ${name}`)
  }

  const championCard = championId ? cardsById.get(championId) : undefined
  const sections: [heading: string, lines: string[]][] = [
    ['Legend', legendCard ? [`1 ${riftboundDecklistName(legendCard)}`] : []],
    ['Champion', championCard ? [`1 ${riftboundDecklistName(championCard)}`] : []],
    ['MainDeck', linesFor('main', championId)],
    ['Battlefields', linesFor('battlefields')],
    ['Runes', (deck.freeTextZones.runes ?? []).filter((r) => r.quantity > 0).map((r) => `${r.quantity} ${r.label} Rune`)],
    ['Sideboard', linesFor('sideboard')],
  ]
  return sections
    .filter(([, lines]) => lines.length > 0)
    .map(([heading, lines]) => [`${heading}:`, ...lines].join('\n'))
    .join('\n\n')
}

function getGuidedStage(deck: Deck, cardsById: Map<string, Card>): GuidedStage | null {
  const hasLegend = (deck.zones.legend ?? []).length > 0
  if (!hasLegend) {
    // Battlefields are their own independent zone with no bearing on which
    // Legend you pick, so there's no reason a stage filter should hide them
    // — you can queue them up any time during the build, not just once the
    // guided flow happens to land on a stage with no filter of its own.
    return {
      label: t.stages.pickLegend,
      filter: (card) => card.category === 'Legend' || card.category === 'Battlefield',
      targetZoneId: 'legend',
    }
  }

  const mainEntries = deck.zones.main ?? []
  const hasChampion = mainEntries.some((e) => cardsById.get(e.cardId)?.subtypes.includes('Champion'))
  if (!hasChampion) {
    return {
      label: t.stages.pickChampion,
      filter: (card) => card.subtypes.includes('Champion') || card.category === 'Battlefield',
      targetZoneId: 'main',
    }
  }

  const mainTotal = mainEntries.reduce((sum, e) => sum + e.quantity, 0)
  if (mainTotal < 40) return null // back to normal main-deck browsing

  return { label: t.stages.fillSideboard, targetZoneId: 'sideboard' }
}

export const riftboundAdapter: GameAdapter = {
  id: 'riftbound',
  typeOrder: ['Unit', 'Spell', 'Gear', 'Battlefield', 'Legend', 'Rune'],
  filterKinds: ['Champion', 'Signature'],
  name: 'Riftbound: League of Legends TCG',
  shortName: 'Riftbound',
  deckRules,
  defaultFormats,
  legalitySource: 'local',
  hasPrices: false,
  openingHandSize: 4,
  fetchAllCards,
  formatDecklistText,
  plainExportText: true,
  getGuidedStage,
  mainDeckExcludedCategories: ['Legend', 'Rune'],
}
