import type { DeckRules } from '../types'
import type { GameAdapter } from './types'

/** The deck rules that apply to a format: its own set if the game defines one, else the game's default. */
export function rulesForFormat(adapter: GameAdapter, formatId: string | null | undefined): DeckRules {
  return (formatId ? adapter.deckRulesByFormat?.[formatId] : undefined) ?? adapter.deckRules
}
