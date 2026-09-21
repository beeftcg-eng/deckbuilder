import type { GameId } from '../types'
import type { GameAdapter } from './types'
import { pokemonAdapter } from './pokemon'
import { onepieceAdapter } from './onepiece'
import { riftboundAdapter } from './riftbound'
import { mtgAdapter } from './mtg'
import { yugiohAdapter } from './yugioh'

export const GAME_ADAPTERS: Record<GameId, GameAdapter> = {
  pokemon: pokemonAdapter,
  onepiece: onepieceAdapter,
  riftbound: riftboundAdapter,
  mtg: mtgAdapter,
  yugioh: yugiohAdapter,
}

export const GAME_LIST: GameAdapter[] = [riftboundAdapter, onepieceAdapter, pokemonAdapter, mtgAdapter, yugiohAdapter]

export function getAdapter(gameId: GameId): GameAdapter {
  return GAME_ADAPTERS[gameId]
}
