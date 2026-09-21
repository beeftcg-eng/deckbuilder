import type { GameId } from '../types'
import type { GameAdapter } from './types'
import { pokemonAdapter } from './pokemon'
import { onepieceAdapter } from './onepiece'
import { riftboundAdapter } from './riftbound'
import { mtgAdapter } from './mtg'

export const GAME_ADAPTERS: Record<GameId, GameAdapter> = {
  pokemon: pokemonAdapter,
  onepiece: onepieceAdapter,
  riftbound: riftboundAdapter,
  mtg: mtgAdapter,
}

export const GAME_LIST: GameAdapter[] = [riftboundAdapter, onepieceAdapter, pokemonAdapter, mtgAdapter]

export function getAdapter(gameId: GameId): GameAdapter {
  return GAME_ADAPTERS[gameId]
}
