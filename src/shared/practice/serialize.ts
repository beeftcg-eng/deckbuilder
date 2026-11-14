import type { Card } from '../types'
import type { GameState } from './riftbound'

/**
 * A practice game as compact JSON, for saving it to resume later and for sending it to the other
 * player in an online game: each card is just its id (both ends have the card data), except the
 * tokens the game made up, which travel whole.
 */
const isToken = (id: string) => id.startsWith('riftbound:token-')

/** Any game's state (Riftbound's, One Piece's) with its cards as ids. */
export function packState(state: object): string {
  return JSON.stringify(state, (_key, value: unknown) => {
    if (value && typeof value === 'object' && 'gameId' in value && 'sourceId' in value && 'name' in value) {
      const card = value as Card
      if (!isToken(card.id)) return { $card: card.id }
    }
    return value
  })
}

/** packState's JSON back, its cards from `cardsById`; null when it can't be read or a card is missing. */
export function unpackCards<T>(packed: string, cardsById: Map<string, Card>): T | null {
  let missing = false
  try {
    const value = JSON.parse(packed, (_key, v: unknown) => {
      if (v && typeof v === 'object' && '$card' in v) {
        const card = cardsById.get(String((v as { $card: unknown }).$card))
        if (!card) missing = true
        return card ?? null
      }
      return v
    }) as T
    return missing ? null : value
  } catch {
    return null
  }
}

/** The game back, its cards from `cardsById`; null when it can't be read or a card is missing. */
export function unpackState(packed: string, cardsById: Map<string, Card>): GameState | null {
  try {
    const state = unpackCards<GameState>(packed, cardsById)
    if (!state || !Array.isArray(state.players) || !Array.isArray(state.battlefields)) return null
    // Saved before hidden cards existed.
    for (const bf of state.battlefields) bf.hidden ??= []
    state.manual ??= []
    return state
  } catch {
    return null
  }
}
