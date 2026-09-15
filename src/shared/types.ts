export type GameId = 'pokemon' | 'onepiece' | 'riftbound'

/** A card normalized into a common shape, regardless of source game/API. */
export interface Card {
  /** Globally unique id: `${gameId}:${sourceId}` */
  id: string
  gameId: GameId
  /** The id used by the source API/game to identify this exact printing. */
  sourceId: string
  name: string
  imageUrl: string | null
  imageUrlSmall: string | null
  setId: string
  setName: string
  /** Short human-facing set code used in decklist exports (e.g. "SVI", "OP-01", "UNL"). */
  setCode: string
  /** Collector number within the set, as printed (string to allow things like "SP-01"). */
  number: string
  rarity: string | null
  /** e.g. Pokemon/Trainer/Energy, Leader/Character/Event/Stage, Unit/Spell/Gear/Legend/Battlefield */
  category: string
  /** Secondary tag, e.g. Riftbound "Champion" supertype, Pokemon subtypes joined. */
  subtypes: string[]
  /** Color/domain identity used for deck color-lock rules. Empty for colorless/neutral cards. */
  colors: string[]
  cost: string | null
  text: string | null
  legality: Record<string, CardLegalityStatus> | null
}

export type CardLegalityStatus = 'legal' | 'banned' | 'restricted'

export interface DeckZoneRule {
  id: string
  label: string
  /** Card must satisfy this to be placed in this zone. */
  match: (card: Card) => boolean
  exactCount?: number
  minCount?: number
  maxCount?: number
  /** If set, the zone's total count must equal one of these values (e.g. Riftbound sideboard: 0 or 8). */
  allowedCounts?: number[]
  /** Overrides the deck-wide max-copies-per-card rule for this zone. */
  maxCopiesPerCard?: number
  /** Cards in this zone must have unique names (e.g. Riftbound battlefields). */
  uniqueNames?: boolean
  /** This zone is a free-text resource zone (e.g. Riftbound runes) keyed by a label, not real Card ids. */
  freeText?: { options: string[] }
}

export interface DeckRules {
  zones: DeckZoneRule[]
  /** Default max copies of a single card (by name) across the whole deck, unless a zone overrides it. */
  defaultMaxCopiesPerCard: number
  /** If true, all non-basic cards must share a color/domain with the deck's designated identity card. */
  colorLocked: boolean
  identityZoneId?: string
}

export interface DeckCardEntry {
  cardId: string
  quantity: number
}

export interface DeckFreeTextEntry {
  label: string
  quantity: number
}

export interface Deck {
  id: string
  gameId: GameId
  name: string
  formatId: string
  /** zoneId -> entries. Most zones use DeckCardEntry[]; freeText zones use DeckFreeTextEntry[]. */
  zones: Record<string, DeckCardEntry[]>
  freeTextZones: Record<string, DeckFreeTextEntry[]>
  createdAt: string
  updatedAt: string
}

export interface Format {
  id: string
  label: string
  description?: string
  /** If set, only cards whose setId is in this list are legal (undefined = all sets legal). */
  legalSetIds?: string[]
  bannedCardIds: string[]
  restrictedCardIds: string[]
  /** Pairs of card ids/names that cannot both appear in the same deck. */
  bannedPairs: [string, string][]
}

export interface LegalityIssue {
  severity: 'error' | 'warning'
  message: string
}

export interface LegalityResult {
  legal: boolean
  issues: LegalityIssue[]
}

export interface SyncProgress {
  gameId: GameId
  loaded: number
  total: number
  done: boolean
  error?: string
}

export interface CardCacheMeta {
  gameId: GameId
  count: number
  lastSynced: string | null
}
