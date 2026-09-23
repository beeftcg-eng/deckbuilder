import { describe, expect, it } from 'vitest'
import { rpcForOp } from './ops'
import { makeDeck } from '../testFixtures'
import type { Binder } from '../types'

describe('rpcForOp', () => {
  it('maps save_deck/delete_deck to the matching deckbuilder_* RPC and params', () => {
    const deck = makeDeck('yugioh', {})
    expect(rpcForOp({ type: 'save_deck', id: deck.id, gameId: deck.gameId, data: deck })).toEqual({
      name: 'deckbuilder_save_deck',
      params: { p_id: deck.id, p_game_id: deck.gameId, p_data: deck },
    })
    expect(rpcForOp({ type: 'delete_deck', id: deck.id })).toEqual({ name: 'deckbuilder_delete_deck', params: { p_id: deck.id } })
  })

  it('maps save_binder/delete_binder to the matching deckbuilder_* RPC and params, with no game_id (unlike decks)', () => {
    const binder: Binder = { id: 'b1', name: 'Trade binder', cards: { 'yugioh:123': 2 }, createdAt: 'x', updatedAt: 'x' }
    expect(rpcForOp({ type: 'save_binder', id: binder.id, data: binder })).toEqual({
      name: 'deckbuilder_save_binder',
      params: { p_id: binder.id, p_data: binder },
    })
    expect(rpcForOp({ type: 'delete_binder', id: binder.id })).toEqual({ name: 'deckbuilder_delete_binder', params: { p_id: binder.id } })
  })
})
