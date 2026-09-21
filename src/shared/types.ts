export type GameId = 'pokemon' | 'onepiece' | 'riftbound' | 'mtg' | 'yugioh'

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
  /** The card's own colors/domains. Empty for colorless/neutral cards. */
  colors: string[]
  /**
   * Color identity, for games where it differs from `colors` (Magic: a land's
   * mana abilities, or a hybrid symbol in rules text, count toward identity but
   * not toward the card's color). Deck color-locking and the browser's color
   * filter use this when present, else `colors`.
   */
  colorIdentity?: string[]
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

/** 'restricted' = one copy (Vintage's restricted list, Yu-Gi-Oh!'s Limited); 'semi-restricted' = two copies (Yu-Gi-Oh!'s Semi-Limited). */
export type CardLegalityStatus = 'legal' | 'banned' | 'restricted' | 'semi-restricted'

export interface DeckZoneRule {
  id: string
  label: string
  /** Card must satisfy this to be placed in this zone. */
  match: (card: Card) => boolean
  exactCount?: number
  minCount?: number
  maxCount?: number
  /** If set, the zone's total count must equal one of these values (e.g. Riftbound sideboard: 0 or 10). */
  allowedCounts?: number[]
  /** Overrides the deck-wide max-copies-per-card rule for this zone. */
  maxCopiesPerCard?: number
  /** Cards in this zone must have unique names (e.g. Riftbound battlefields). */
  uniqueNames?: boolean
  /**
   * Cards are never put here by a plain click in the card browser (which uses the first
   * matching zone that isn't manual) — only through a guided stage, an import header, or the
   * deck panel's "move" buttons. For zones that overlap another one, like a sideboard or a
   * Commander, where most cards that qualify belong in the main deck instead.
   */
  manualOnly?: boolean
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
  /** If true, all non-basic cards must share a color/domain with the deck's designated identity card(s). */
  colorLocked: boolean
  identityZoneId?: string
  /** If set, every (non-free-text) zone together must hold exactly this many cards, e.g. Commander's 100 including the commander. */
  totalCount?: number
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
  /** The card picked to stand for this deck in the deck list; when unset (or no longer in the deck) a default is chosen — see deckIcon.ts. */
  iconCardId?: string
  /** A locked deck can't be changed (cards, name, format, icon) or deleted until it's unlocked. */
  locked?: boolean
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

/** How the full-screen deck view shows the deck: card images, a compact list, or the plain-text decklist. */
export type DeckViewMode = 'grid' | 'list' | 'text'

export interface AppSettings {
  lastGameId?: GameId
  lastDeckId?: string | null
  deckSort?: 'recent' | 'name' | 'custom'
  /** Deck ids in the order chosen by dragging them in the sidebar (used by the 'custom' sort). */
  deckOrder?: string[]
  /** Game ids in the order arranged in the sidebar. */
  gameOrder?: GameId[]
  deckViewMode?: DeckViewMode
  /** Colour theme id (see shared/themes.ts). */
  theme?: string
}

export interface PawmodoroConfig {
  url: string
  anonKey: string
  email: string
  connected: boolean
}
