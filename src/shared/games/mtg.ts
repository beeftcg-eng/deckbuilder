import type { Card, CardLegalityStatus, Deck, DeckRules, Format } from '../types'
import type { FetchProgress, GameAdapter, GuidedStage } from './types'
import { SCRYFALL_HEADERS, fetchJson } from './fetchUtil'

// Scryfall's "Oracle Cards" bulk file: one entry per unique card (~35k), each shown as its most
// recognizable printing. That matches how Magic decks are built and limited — by card name, not
// printing — and is a 25 MB gzipped download instead of the 800+ MB of every printing. Bulk files
// are refreshed daily and are Scryfall's recommended way to fetch the whole catalog.
const BULK_INFO_URL = 'https://api.scryfall.com/bulk-data/oracle_cards'

/** Scryfall's format keys — also this game's Format ids, so `card.legality[format.id]` just works. */
export const MTG_FORMAT_IDS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'commander', 'pauper'] as const

const COLOR_NAMES: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' }
const COLOR_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green']

// Not deck cards: tokens, emblems and art cards, plus Un-set gimmick layouts and out-of-deck
// card types (Planechase, Archenemy, Vanguard) that no supported format allows.
const NON_DECK_CATEGORIES = new Set(['Stickers']) // Unfinity sticker sheets: legal in Scryfall's data, but they live outside the deck

const SKIPPED_LAYOUTS = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'front_card', 'vanguard', 'scheme', 'planar', 'host', 'augment'])

interface ScryfallImageUris {
  small?: string
  normal?: string
  large?: string
}

interface ScryfallFace {
  name?: string
  mana_cost?: string
  type_line?: string
  oracle_text?: string
  colors?: string[]
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
  image_uris?: ScryfallImageUris
}

export interface ScryfallCard extends ScryfallFace {
  id: string
  oracle_id?: string
  layout: string
  name: string
  cmc?: number
  color_identity?: string[]
  set: string
  set_name: string
  collector_number: string
  rarity?: string
  legalities?: Record<string, string>
  prices?: { usd?: string | null; usd_foil?: string | null; usd_etched?: string | null }
  card_faces?: ScryfallFace[]
}

const SUPERTYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Ongoing', 'Elite', 'Host'])
// When a card has several types the first of these is its category ("Artifact Creature" is a
// Creature, "Artifact Land" a Land) — the same grouping deck sites use.
const CATEGORY_ORDER = ['Creature', 'Land', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment']

/** Category and subtype tags from the front face's type line, e.g. "Legendary Artifact Creature — Golem". */
function parseTypeLine(typeLine: string): { category: string; subtypes: string[] } {
  const front = typeLine.split(' // ')[0]
  const [typesPart, subtypesPart = ''] = front.split(' — ')
  const words = typesPart.split(/\s+/).filter(Boolean)
  const types = words.filter((w) => !SUPERTYPES.has(w))
  const category = CATEGORY_ORDER.find((t) => types.includes(t)) ?? types[0] ?? 'Other'
  // Everything else on the line (Legendary, Basic, a second card type, creature types…) so it is searchable
  // and so rules that need "Legendary" or "Basic" can see it.
  return { category, subtypes: [...words.filter((w) => w !== category), ...subtypesPart.split(/\s+/).filter(Boolean)] }
}

function describeFace(face: ScryfallFace, showName: boolean): string {
  const lines: string[] = []
  if (showName && face.name) lines.push(face.name)
  const header = [face.mana_cost, face.type_line].filter(Boolean).join(' · ')
  if (header) lines.push(header)
  if (face.oracle_text) lines.push(face.oracle_text)
  if (face.power != null && face.toughness != null) lines.push(`${face.power}/${face.toughness}`)
  else if (face.loyalty != null) lines.push(`Loyalty ${face.loyalty}`)
  else if (face.defense != null) lines.push(`Defense ${face.defense}`)
  return lines.join('\n')
}

function toColorNames(letters: string[] | undefined): string[] {
  return (letters ?? []).map((c) => COLOR_NAMES[c] ?? c)
}

function legalityOf(raw: ScryfallCard): Record<string, CardLegalityStatus> {
  const legality: Record<string, CardLegalityStatus> = {}
  for (const format of MTG_FORMAT_IDS) {
    const status = raw.legalities?.[format]
    if (status === 'legal' || status === 'restricted' || status === 'banned') legality[format] = status
  }
  return legality
}

function priceOf(raw: ScryfallCard): number | null {
  // Foil-only and etched-only printings have no plain price; theirs is the cheapest way to own the card.
  const value = Number(raw.prices?.usd ?? raw.prices?.usd_foil ?? raw.prices?.usd_etched)
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * Turns one Scryfall card object into a Card, or null for things that aren't deck cards. Cards
 * that no supported format can ever play (Un-sets, digital-only Alchemy…) are left out too, except
 * ones legal in the upcoming Standard, so a card can be browsed as soon as it's spoiled.
 *
 * The id is the card's `oracle_id`, not the printing's: Scryfall may show a different printing of
 * a card after any update, and saved decks, collection and wishlist entries must keep pointing at
 * the same card when it does.
 */
export function normalizeCard(raw: ScryfallCard): Card | null {
  if (SKIPPED_LAYOUTS.has(raw.layout)) return null
  const legality = legalityOf(raw)
  const playable = Object.values(legality).some((status) => status === 'legal' || status === 'restricted')
  if (!playable && raw.legalities?.future !== 'legal') return null

  const faces = raw.card_faces?.length ? raw.card_faces : [raw]
  const front = faces[0]
  const { category, subtypes } = parseTypeLine(raw.type_line ?? front.type_line ?? '')
  if (NON_DECK_CATEGORIES.has(category)) return null
  const images = raw.image_uris ?? front.image_uris
  const oracleId = raw.oracle_id ?? raw.id
  const rarity = raw.rarity ? raw.rarity[0].toUpperCase() + raw.rarity.slice(1) : null

  return {
    id: `mtg:${oracleId}`,
    gameId: 'mtg',
    sourceId: oracleId,
    name: raw.name,
    imageUrl: images?.large ?? images?.normal ?? null,
    imageUrlSmall: images?.small ?? images?.normal ?? null,
    orientation: 'portrait',
    setId: raw.set,
    setName: raw.set_name,
    setCode: raw.set.toUpperCase(),
    number: raw.collector_number,
    rarity,
    category,
    subtypes,
    colors: toColorNames(raw.colors ?? front.colors),
    colorIdentity: toColorNames(raw.color_identity),
    // Lands are left out of the cost curve and average, like deck sites do.
    cost: category === 'Land' || raw.cmc == null ? null : String(raw.cmc),
    text: faces.map((face) => describeFace(face, faces.length > 1)).join('\n\n') || null,
    legality,
    price: priceOf(raw),
  }
}

/**
 * Reads a gzipped JSON Lines bulk file (one card per line) as it downloads, so the ~200 MB it
 * unpacks to is never held as one string. Progress is an estimate of the total from how far
 * through the compressed download we are, since the card count isn't known up front.
 */
export async function readBulkCards(res: Response, onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  if (!res.body) throw new Error('Scryfall sent an empty response')
  const totalBytes = Number(res.headers.get('content-length')) || 0
  let readBytes = 0
  const counter = new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({
    transform(chunk, controller) {
      readBytes += chunk.byteLength
      controller.enqueue(chunk)
    },
  })
  const reader = res.body
    .pipeThrough(counter)
    .pipeThrough(new DecompressionStream('gzip'))
    .pipeThrough(new TextDecoderStream())
    .getReader()

  const cards: Card[] = []
  let leftover = ''
  const handleLine = (line: string) => {
    if (!line.trim()) return
    let raw: ScryfallCard
    try {
      raw = JSON.parse(line) as ScryfallCard
    } catch {
      return // a damaged line shouldn't sink the whole sync; an empty result is caught below
    }
    const card = normalizeCard(raw)
    if (card) cards.push(card)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = (leftover + value).split('\n')
    leftover = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
    const estimatedTotal = totalBytes > 0 && readBytes > 0 ? Math.round((cards.length * totalBytes) / readBytes) : 0
    onProgress({ loaded: cards.length, total: Math.max(estimatedTotal, cards.length) })
  }
  handleLine(leftover)

  if (cards.length === 0) throw new Error('Scryfall returned no cards')
  onProgress({ loaded: cards.length, total: cards.length })
  return cards
}

async function fetchAllCards(onProgress: (p: FetchProgress) => void): Promise<Card[]> {
  onProgress({ loaded: 0, total: 0 })
  const info = await fetchJson<{ jsonl_download_uri?: string }>(BULK_INFO_URL, 1, SCRYFALL_HEADERS)
  if (!info.jsonl_download_uri) throw new Error("Scryfall didn't say where its card data file is")
  const res = await fetch(info.jsonl_download_uri, { headers: SCRYFALL_HEADERS })
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${info.jsonl_download_uri}`)
  return readBulkCards(res, onProgress)
}

/** Legendary creatures, and cards that say they can be your commander. (Legendary Vehicles/Spacecraft and Backgrounds aren't recognised.) */
export function canBeCommander(card: Card): boolean {
  return (card.category === 'Creature' && card.subtypes.includes('Legendary')) || /can be your commander/i.test(card.text ?? '')
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }

/** Basic lands, and the few cards whose own text lifts the limit ("A deck can have any number of cards named…" / "up to nine…"). */
function copyLimitFor(card: Card): number | null {
  if (card.category === 'Land' && card.subtypes.includes('Basic')) return Infinity
  const match = /A deck can have (?:any number of|up to (\w+)) cards named/i.exec(card.text ?? '')
  if (!match) return null
  return match[1] ? (NUMBER_WORDS[match[1].toLowerCase()] ?? null) : Infinity
}

const constructedRules: DeckRules = {
  defaultMaxCopiesPerCard: 4,
  colorLocked: false,
  zones: [
    { id: 'main', label: 'Main Deck', match: () => true, minCount: 60 },
    { id: 'sideboard', label: 'Sideboard', match: () => true, maxCount: 15, manualOnly: true },
  ],
}

const commanderRules: DeckRules = {
  defaultMaxCopiesPerCard: 1,
  colorLocked: true,
  identityZoneId: 'commander',
  totalCount: 100,
  zones: [
    // Up to two, for Partner pairs. Chosen through the guided first step, then moved in/out with the deck panel's buttons.
    { id: 'commander', label: 'Commander', match: canBeCommander, minCount: 1, maxCount: 2, maxCopiesPerCard: 1, manualOnly: true },
    { id: 'main', label: 'Main Deck', match: () => true, maxCount: 99 },
  ],
}

const LEGALITY_NOTE = "Card legality comes from Scryfall's data and is refreshed by Update card data."

const defaultFormats: Format[] = [
  { id: 'standard', label: 'Standard', description: `60-card minimum, up to 15 in the sideboard, 4 copies. ${LEGALITY_NOTE}` },
  { id: 'pioneer', label: 'Pioneer', description: `60-card minimum, up to 15 in the sideboard, 4 copies. ${LEGALITY_NOTE}` },
  { id: 'modern', label: 'Modern', description: `60-card minimum, up to 15 in the sideboard, 4 copies. ${LEGALITY_NOTE}` },
  { id: 'legacy', label: 'Legacy', description: `60-card minimum, up to 15 in the sideboard, 4 copies. ${LEGALITY_NOTE}` },
  { id: 'vintage', label: 'Vintage', description: `60-card minimum, up to 15 in the sideboard, 4 copies, restricted cards limited to 1. ${LEGALITY_NOTE}` },
  {
    id: 'commander',
    label: 'Commander',
    description: `100 cards including your commander (or two Partners), one copy of each card except basic lands, and every card within your commander's color identity. ${LEGALITY_NOTE}`,
  },
  { id: 'pauper', label: 'Pauper', description: `60-card minimum, up to 15 in the sideboard, 4 copies, cards printed at common. ${LEGALITY_NOTE}` },
].map((f) => ({ ...f, bannedCardIds: [], restrictedCardIds: [], bannedPairs: [] }))

const DECKLIST_SECTIONS: [heading: string, zoneId: string][] = [
  ['Commander', 'commander'],
  ['Deck', 'main'],
  ['Sideboard', 'sideboard'],
]

/** The "Deck / Sideboard / Commander" list that Arena, MTGO-style importers, Moxfield and Archidekt all read. */
function formatDecklistText(deck: Deck, cardsById: Map<string, Card>): string {
  const blocks: string[] = []
  for (const [heading, zoneId] of DECKLIST_SECTIONS) {
    const lines = (deck.zones[zoneId] ?? [])
      .flatMap((entry) => {
        const card = cardsById.get(entry.cardId)
        return card ? [{ name: card.name, quantity: entry.quantity }] : []
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => `${e.quantity} ${e.name}`)
    if (lines.length > 0) blocks.push([heading, ...lines].join('\n'))
  }
  return blocks.join('\n\n')
}

function getGuidedStage(deck: Deck): GuidedStage | null {
  if (deck.formatId !== 'commander' || (deck.zones.commander ?? []).length > 0) return null
  return { label: 'Pick your Commander', filter: canBeCommander, filterLabel: 'Commanders only', targetZoneId: 'commander' }
}

export const mtgAdapter: GameAdapter = {
  id: 'mtg',
  name: 'Magic: The Gathering',
  shortName: 'Magic',
  deckRules: constructedRules,
  deckRulesByFormat: { commander: commanderRules },
  defaultFormats,
  legalitySource: 'api',
  hasPrices: true,
  openingHandSize: 7,
  fetchAllCards,
  formatDecklistText,
  getGuidedStage,
  copyLimitFor,
  colorOrder: COLOR_ORDER,
  setNote: "Magic's card data lists one printing of each card, so a set here holds only the cards Scryfall currently shows from it, not everything ever printed in it.",
  identityColorFilter: true,
  importOptions: { blankLineStartsSideboard: true, stripPrintingSuffix: true },
}
