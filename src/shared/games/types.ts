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
  /** Zone that a card click should add to while this stage is active, overriding the default first-match zone. */
  targetZoneId: string
}

export interface GameAdapter {
  id: GameId
  name: string
  shortName: string
  deckRules: DeckRules
  defaultFormats: Format[]
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
  /** Returns the current step of a guided deckbuilding flow (e.g. pick Legend, then Champion), or null once nothing more needs steering. */
  getGuidedStage?: (deck: Deck, cardsById: Map<string, Card>) => GuidedStage | null
}
