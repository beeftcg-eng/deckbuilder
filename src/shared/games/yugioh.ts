import type { Card, CardLegalityStatus, Deck, DeckRules, Format } from '../types'
import type { FetchProgress, GameAdapter } from './types'
import { fetchJsonWithRetry } from './fetchUtil'

// YGOPRODeck's card database: every card in one request (~3.4 MB compressed, about a second), with per-format
// legality and the Forbidden / Limited / Semi-Limited lists. Its API guide forbids hotlinking card images
// ("IP blacklist"), so the images are not linked to directly: imageUrl / imageUrlSmall are `dbimg://` addresses that
// the app itself fetches once and keeps in a local cache (electron/lib/imageCache.ts).
const API_URL = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes'
const HEADERS = { 'User-Agent': 'Deckbuilder/1.0', Accept: 'application/json' }

/** Format ids double as the `card.legality` keys. */
export const YGO_FORMAT_IDS = ['tcg', 'ocg', 'goat'] as const
/** The name each format goes by in YGOPRODeck's `misc_info.formats` and `banlist_info`. */
const FORMAT_SOURCE: Record<(typeof YGO_FORMAT_IDS)[number], { formatName: string; banKey: string }> = {
  tcg: { formatName: 'TCG', banKey: 'ban_tcg' },
  ocg: { formatName: 'OCG', banKey: 'ban_ocg' },
  goat: { formatName: 'GOAT', banKey: 'ban_goat' },
}

export interface YgoCard {
  id: number
  name: string
  type: string
  humanReadableCardType?: string
  race?: string
  atk?: number
  def?: number
  level?: number
  attribute?: string
  linkval?: number
  scale?: number
  desc?: string
  typeline?: string[]
  archetype?: string
  banlist_info?: Record<string, string>
  card_sets?: { set_name: string; set_code: string; set_rarity?: string; set_price?: string }[]
  card_images?: { id: number }[]
  card_prices?: { tcgplayer_price?: string }[]
  misc_info?: { formats?: string[] }[]
}

/** Cards that aren't part of a deck: Tokens, and Skill Cards (a Speed Duel / Duel Links mechanic). */
const NON_DECK_TYPES = new Set(['Token', 'Skill Card'])

/** Fusion, Synchro, XYZ and Link monsters (Pendulum versions too) live in the Extra Deck. */
export function isExtraDeckType(type: string): boolean {
  return /Fusion|Synchro|XYZ|Link/.test(type)
}

export const isExtraDeckCard = (card: Card): boolean => card.subtypes.includes('Extra Deck')

const titleCase = (word: string) => word.charAt(0) + word.slice(1).toLowerCase()

function categoryOf(type: string): string {
  if (type === 'Spell Card') return 'Spell'
  if (type === 'Trap Card') return 'Trap'
  return 'Monster'
}

function banStatus(value: string | undefined): CardLegalityStatus {
  if (value === 'Forbidden') return 'banned'
  if (value === 'Limited') return 'restricted' // one copy
  if (value === 'Semi-Limited') return 'semi-restricted' // two copies
  return 'legal'
}

function describe(raw: YgoCard): string {
  const lines: string[] = []
  const kind = raw.humanReadableCardType ?? raw.type
  const facts: string[] = []
  if (categoryOf(raw.type) === 'Monster') {
    if (raw.race) facts.push(raw.race)
    if (raw.attribute) facts.push(titleCase(raw.attribute))
    if (raw.linkval != null) facts.push(`Link-${raw.linkval}`)
    else if (raw.level != null) facts.push(/XYZ/.test(raw.type) ? `Rank ${raw.level}` : `Level ${raw.level}`)
    if (raw.scale != null) facts.push(`Scale ${raw.scale}`)
    if (raw.atk != null) facts.push(raw.def != null ? `ATK ${raw.atk} / DEF ${raw.def}` : `ATK ${raw.atk}`)
  } else if (raw.race && !kind.includes(raw.race)) {
    facts.push(raw.race) // "Quick-Play Spell" already says it; "Continuous" isn't in "Spell Card"
  }
  lines.push([kind, ...facts].join(' · '))
  if (raw.desc) lines.push(raw.desc)
  return lines.join('\n\n')
}

/**
 * One Card per set/rarity printing YGOPRODeck lists for this card (an OCG-only card, which often has
 * none, still gets one placeholder entry) — same idea as Magic's alternate-art printings, and no extra
 * request needed: `card_sets` (and each entry's own `set_price`) already comes back in the one bulk
 * request this adapter already makes. Every printing starts out sharing this same id, on purpose:
 * uniquifyCardIds() (shared/cardIds.ts, run over the whole catalog after fetch) splits them apart the
 * same way it does for One Piece and Magic, so an existing deck/collection/wishlist entry (which only
 * ever pointed at one, arbitrary printing) keeps resolving to a real printing after this changed from
 * one row per card to one row per printing.
 */
export function normalizeCard(raw: YgoCard): Card[] {
  if (NON_DECK_TYPES.has(raw.type) || !raw.card_images?.length) return []

  const formats = new Set(raw.misc_info?.[0]?.formats ?? [])
  const legality: Record<string, CardLegalityStatus> = {}
  for (const id of YGO_FORMAT_IDS) {
    const { formatName, banKey } = FORMAT_SOURCE[id]
    if (formats.has(formatName)) legality[id] = banStatus(raw.banlist_info?.[banKey])
  }

  const extra = isExtraDeckType(raw.type)
  const artId = raw.card_images[0].id
  const text = describe(raw)
  const fallbackPrice = Number(raw.card_prices?.[0]?.tcgplayer_price)
  const printings = raw.card_sets?.length ? raw.card_sets : [undefined]

  return printings.map((printing): Card => {
    const [setCode = '', ...numberParts] = (printing?.set_code ?? '').split('-')
    const price = Number(printing?.set_price)
    return {
      id: `yugioh:${raw.id}`,
      gameId: 'yugioh',
      sourceId: String(raw.id), // the passcode: what .ydk deck files list, and shared by every printing (the 3-copy limit is by name)
      name: raw.name,
      imageUrl: `dbimg://ygo/full/${artId}.jpg`,
      imageUrlSmall: `dbimg://ygo/small/${artId}.jpg`,
      orientation: 'portrait',
      setId: setCode || 'none',
      setName: printing?.set_name ?? 'No set listed',
      setCode: setCode || '—',
      number: numberParts.join('-'),
      rarity: printing?.set_rarity ?? null,
      category: categoryOf(raw.type),
      subtypes: [...(raw.typeline ?? (raw.race ? [raw.race] : [])), ...(extra ? ['Extra Deck'] : [])],
      colors: raw.attribute ? [titleCase(raw.attribute)] : [],
      cost: raw.level != null ? String(raw.level) : null,
      text,
      legality,
      // This printing's own market price when YGOPRODeck has one, else the card's general TCGplayer price.
      price: Number.isFinite(price) && price > 0 ? price : Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : null,
    }
  })
}

async function fetchAllCards(onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  onProgress({ loaded: 0, total: 0 })
  const response = await fetchJsonWithRetry<{ data?: YgoCard[] }>(API_URL, { headers: HEADERS, timeoutMs: 120_000 })
  const cards = (response.data ?? []).flatMap((raw) => normalizeCard(raw))
  if (cards.length === 0) throw new Error('YGOPRODeck returned no cards')
  onProgress({ loaded: cards.length, total: cards.length })
  return cards
}

const deckRules: DeckRules = {
  defaultMaxCopiesPerCard: 3, // by name, across the Main, Extra and Side Decks together
  colorLocked: false,
  zones: [
    { id: 'main', label: 'Main Deck', match: (card) => !isExtraDeckCard(card), minCount: 40, maxCount: 60 },
    { id: 'extra', label: 'Extra Deck', match: isExtraDeckCard, maxCount: 15 },
    { id: 'sideboard', label: 'Side Deck', match: () => true, maxCount: 15, manualOnly: true },
  ],
}

const NOTE = "Legality and the Forbidden / Limited / Semi-Limited list come from YGOPRODeck's data and are refreshed by Update card data."

const defaultFormats: Format[] = [
  { id: 'tcg', label: 'TCG', description: `Advanced format, 40–60 card Main Deck, up to 15 in the Extra and Side Decks, 3 copies. ${NOTE}` },
  { id: 'ocg', label: 'OCG', description: `Advanced format with the OCG list, which differs from the TCG's. ${NOTE}` },
  { id: 'goat', label: 'GOAT (2005)', description: `The retro format: only cards from that era are legal, under the GOAT list. ${NOTE}` },
].map((f) => ({ ...f, bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] }))

const DECKLIST_SECTIONS: [heading: string, zoneId: string][] = [
  ['Main Deck', 'main'],
  ['Extra Deck', 'extra'],
  ['Side Deck', 'sideboard'],
]

/** "Main Deck / Extra Deck / Side Deck" with "3 Name" lines: what Master Duel, Dueling Book and the deck sites read. */
function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const blocks: string[] = []
  for (const [heading, zoneId] of DECKLIST_SECTIONS) {
    const lines = (deck.zones[zoneId] ?? []).flatMap((entry) => {
      const card = cardsById.get(entry.cardId)
      return card ? [`${entry.quantity} ${card.name}`] : []
    })
    if (lines.length > 0) blocks.push([heading, ...lines].join('\n'))
  }
  return blocks.join('\n\n')
}

export const yugiohAdapter: GameAdapter = {
  id: 'yugioh',
  name: 'Yu-Gi-Oh! Trading Card Game',
  shortName: 'Yu-Gi-Oh!',
  deckRules,
  defaultFormats,
  legalitySource: 'api',
  hasPrices: true,
  openingHandSize: 5,
  fetchAllCards,
  formatDecklistText,
  setNote: "A handful of newly-spoiled or OCG-only cards have no set data yet and won't appear under any set.",
}
