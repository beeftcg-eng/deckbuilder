import type { Card, Deck, DeckRules, Format, GameId } from '../types'

export interface FetchProgress {
  loaded: number
  total: number
}

export interface GuidedStage {
  /** Shown to the user, e.g. "Pick your Legend". */
  label: string
  /** Only cards matching this are shown in the browser while this stage is active. Omit to allow any card. */
  filter?: (card: Card) => boolean
  /** If set, the card browser offers a switch with this label to turn the stage's filter off and browse every card. */
  filterLabel?: string
  /** Zone that a card click should add to while this stage is active, overriding the default first-match zone. */
  targetZoneId: string
}

export interface GameAdapter {
  id: GameId
  name: string
  shortName: string
  /** Zones and limits. Used for every format that has no entry in `deckRulesByFormat`. */
  deckRules: DeckRules
  /** Formats whose deck shape differs from `deckRules` (Magic's 100-card singleton Commander vs 60-card constructed). Use rulesForFormat() to read. */
  deckRulesByFormat?: Record<string, DeckRules>
  defaultFormats: Format[]
  /**
   * Where legality comes from: 'api' when each card's legality is in the source
   * data (Pokémon), 'local' when it's a ban list/rotation kept in formats.json
   * that has to be maintained by hand (One Piece, Riftbound).
   */
  legalitySource: 'api' | 'local'
  /** Whether the source API gives card prices (Riftbound's doesn't), so the UI knows when to hint at re-syncing. */
  hasPrices: boolean
  /** A sync that couldn't get a card's price keeps the one it had before (Pokémon's price source is unreliable). */
  keepPricesWhenMissing?: boolean
  /** Cards drawn for an opening hand, used by the sample-hand simulator. */
  openingHandSize: number
  /** Fetches every card for this game from its source API. Network-only; must run in the main process. */
  fetchAllCards: (onProgress: (p: FetchProgress) => void) => Promise<Card[]>
  /** Renders a deck as a plain-text decklist in this game's conventional format. */
  formatDecklistText: (deck: Deck, cardsById: Map<string, Card>) => string
  /**
   * Card categories to hide from the default "All types" browser view (e.g. Legend, Rune) —
   * they have their own zone/step and just clutter Main Deck browsing. Still reachable by
   * explicitly picking that category from the type dropdown.
   */
  mainDeckExcludedCategories?: string[]
  /**
   * Show the deck-stats panel's per-subtype breakdown (`DeckStats.bySubtype`). Off by default:
   * `card.subtypes` holds creature types for Magic, which would render dozens of noisy one/two-
   * count chips; Yu-Gi-Oh's subtypes (Normal/Effect/Fusion/Synchro/XYZ/Link/Pendulum/Ritual/race)
   * are exactly the "what kind of monsters" breakdown players actually look for.
   */
  showSubtypeStats?: boolean
  /**
   * A per-card copy limit that overrides the rule's default: Infinity for cards a deck can
   * hold any number of (basic Energy, basic lands), or a smaller number. null = no override.
   */
  copyLimitFor?: (card: Card) => number | null
  /** Shown on the collection's Sets tab when a game's card data doesn't list every printing in every set. */
  setNote?: string
  /** Order to show color filter chips in (default: alphabetical). */
  colorOrder?: string[]
  /**
   * The browser's color chips follow color identity (Magic): cards with no colors — artifacts, Sol Ring —
   * always show, and in a color-locked deck only cards entirely within the chosen colors do, rather than any
   * card sharing one of them.
   */
  identityColorFilter?: boolean
  /** Quirks of this game's community decklist formats, used when importing pasted text. */
  importOptions?: {
    /** MTGO-style lists have no "Sideboard" heading: a blank line just starts it. */
    blankLineStartsSideboard?: boolean
    /** Drop a trailing "(SET) 123", "*F*" or "[tag]" from a card line when the full line doesn't match a card. */
    stripPrintingSuffix?: boolean
  }
  /** Returns the current step of a guided deckbuilding flow (e.g. pick Legend, then Champion), or null once nothing more needs steering. */
  getGuidedStage?: (deck: Deck, cardsById: Map<string, Card>) => GuidedStage | null
}
