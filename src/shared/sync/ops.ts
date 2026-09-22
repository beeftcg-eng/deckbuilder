import type { Deck } from '../types'

/** One pending change to Deckbuilder's own synced state (decks/collection/wishlist) - not the
 * trading feature's separate one-way pushes. Each op maps to exactly one deckbuilder_* RPC added
 * alongside deckbuilder_decks in schema.sql. */
export type SyncOp =
  | { type: 'save_deck'; id: string; gameId: string; data: Deck }
  | { type: 'delete_deck'; id: string }
  | { type: 'set_collection_quantity'; gameId: string; cardId: string; cardName: string; setCode: string; quantity: number }
  | { type: 'set_for_trade'; gameId: string; cardId: string; forTrade: boolean }
  | { type: 'wishlist_set_quantity'; gameId: string; cardId: string; cardName: string; quantity: number }

export interface OutboxEntry {
  id: string
  op: SyncOp
}

export function rpcForOp(op: SyncOp): { name: string; params: Record<string, unknown> } {
  switch (op.type) {
    case 'save_deck':
      return { name: 'deckbuilder_save_deck', params: { p_id: op.id, p_game_id: op.gameId, p_data: op.data } }
    case 'delete_deck':
      return { name: 'deckbuilder_delete_deck', params: { p_id: op.id } }
    case 'set_collection_quantity':
      return {
        name: 'deckbuilder_set_collection_quantity',
        params: { p_game_id: op.gameId, p_card_id: op.cardId, p_card_name: op.cardName, p_set_code: op.setCode, p_quantity: op.quantity },
      }
    case 'set_for_trade':
      return { name: 'deckbuilder_set_for_trade', params: { p_game_id: op.gameId, p_card_id: op.cardId, p_for_trade: op.forTrade } }
    case 'wishlist_set_quantity':
      return {
        name: 'deckbuilder_wishlist_set_quantity',
        params: { p_game_id: op.gameId, p_card_id: op.cardId, p_card_name: op.cardName, p_quantity: op.quantity },
      }
  }
}

export interface PulledState {
  decks: { id: string; game_id: string; data: Deck }[]
  collection: { game_id: string; card_id: string; card_name: string; set_code: string; quantity: number; for_trade: boolean }[]
  wants: { game_id: string; card_id: string; card_name: string; quantity: number }[]
}
