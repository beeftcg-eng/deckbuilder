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
  /** Real aspect orientation of the card image — most cards are portrait, but some (e.g. Riftbound Battlefields) are landscape. */
  orientation: 'portrait' | 'landscape'
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
  /**
   * Market price in USD, when the source API provides one (One Piece and
   * Pokémon do; Riftbound doesn't). Optional because card caches synced
   * before prices were added don't have the field until the next sync.
   */
  price?: number | null
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
  /** Default max copies of a single card across the whole deck, unless a zone overrides it. Pooled by name or by sourceId — see copyLimitBy. */
  defaultMaxCopiesPerCard: number
  /**
   * What counts as "the same card" for the copy limit: different printings/art
   * of a card share one pool under 'name' (e.g. Pokémon, Riftbound — official
   * rules cap by card name regardless of set), or each get their own
   * independent limit under 'sourceId' (e.g. One Piece, where a reprint with
   * a different card number, such as ST34-003 vs OP08-066, is legally a
   * separate card for deckbuilding purposes despite sharing a name).
   * Defaults to 'name'.
   */
  copyLimitBy?: 'name' | 'sourceId'
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
  /**
   * When this game's ban/rotation data was last reviewed or edited (ISO). Set
   * when saving from the in-app editor; for files that predate it, the main
   * process fills in the formats file's modified time when listing.
   */
  reviewedAt?: string
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

export interface WishlistEntry {
  id: string
  gameId: GameId
  cardId: string
  quantity: number
  addedAt: string
  /** The Pawmodoro checklist_tasks.id this entry was pushed as, or null if never pushed. */
  pushedTaskId: string | null
}

/** Cards you own, keyed by Card.id (one entry per printing) -> copies owned. */
export type Collection = Record<string, number>

export interface AppSettings {
  lastGameId?: GameId
  lastDeckId?: string | null
  deckSort?: 'recent' | 'name'
}

export interface PawmodoroConfig {
  url: string
  anonKey: string
  email: string
  connected: boolean
}
