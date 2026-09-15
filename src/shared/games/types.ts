import type { Card, Deck, DeckRules, Format, GameId } from '../types'

export interface FetchProgress {
  loaded: number
  total: number
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
}
