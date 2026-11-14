import type { Card } from '../../../shared/types'
import type { GameState } from '../../../shared/practice/riftbound'
import type { Level } from '../../../shared/practice/riftboundBot'
import { packState, unpackState } from '../../../shared/practice/serialize'

/** Who the bot plays: a random recent list for a Legend, one list, or one of your decks. */
export type Opponent = { kind: 'none' } | { kind: 'legend'; legendId: string; listId: string | null } | { kind: 'deck'; deckId: string }

/** What a game is against, for its result. */
export interface GameMeta {
  opponentId: string
  opponentName: string
  level: Level
  byHand: boolean
}

/** The game in progress for a deck, kept on this device to resume. */
export const saveKey = (deckId: string) => `brewhouse.practice.riftbound.${deckId}`
export const TIMELINE = 800

export function readSave(deckId: string, cardsById: Map<string, Card>): { meta: GameMeta; state: GameState } | null {
  try {
    const raw = localStorage.getItem(saveKey(deckId))
    if (!raw) return null
    const { meta, state } = JSON.parse(raw) as { meta: GameMeta; state: string }
    const game = unpackState(state, cardsById)
    return game && meta ? { meta, state: game } : null
  } catch {
    return null
  }
}

export function writeSave(deckId: string, meta: GameMeta, state: GameState | null) {
  try {
    if (!state || state.phase === 'over') localStorage.removeItem(saveKey(deckId))
    else localStorage.setItem(saveKey(deckId), JSON.stringify({ meta, state: packState(state) }))
  } catch {
    // storage full or blocked: the game just can't be resumed
  }
}
