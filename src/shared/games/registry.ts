import type { GameId } from '../types'
import type { GameAdapter } from './types'
import { pokemonAdapter } from './pokemon'
import { onepieceAdapter } from './onepiece'
import { riftboundAdapter } from './riftbound'

export const GAME_ADAPTERS: Record<GameId, GameAdapter> = {
  pokemon: pokemonAdapter,
  onepiece: onepieceAdapter,
  riftbound: riftboundAdapter,
}

export const GAME_LIST: GameAdapter[] = [riftboundAdapter, onepieceAdapter, pokemonAdapter]

export function getAdapter(gameId: GameId): GameAdapter {
  return GAME_ADAPTERS[gameId]
}
