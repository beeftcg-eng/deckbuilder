import { describe, expect, it } from 'vitest'
import { orderGames } from './gameOrder'

const games = ['riftbound', 'onepiece', 'pokemon', 'mtg', 'yugioh'].map((id) => ({ id }))
const ids = (list: { id: string }[]) => list.map((g) => g.id)

describe('orderGames', () => {
  it('keeps the default order when nothing is saved', () => {
    expect(ids(orderGames(games, undefined))).toEqual(ids(games))
    expect(ids(orderGames(games, []))).toEqual(ids(games))
  })
  it('follows the saved order', () => {
    expect(ids(orderGames(games, ['mtg', 'yugioh', 'riftbound', 'onepiece', 'pokemon']))).toEqual(['mtg', 'yugioh', 'riftbound', 'onepiece', 'pokemon'])
  })
  it('appends games that are not in the saved order (a game added by an update), in default order', () => {
    expect(ids(orderGames(games, ['mtg', 'pokemon']))).toEqual(['mtg', 'pokemon', 'riftbound', 'onepiece', 'yugioh'])
  })
  it('ignores unknown and repeated ids, so a stale setting never hides or duplicates a game', () => {
    expect(ids(orderGames(games, ['ghost', 'mtg', 'mtg', 'nope']))).toEqual(['mtg', 'riftbound', 'onepiece', 'pokemon', 'yugioh'])
  })
  it('returns every game exactly once, and does not mutate its input', () => {
    const saved = ['yugioh', 'yugioh', 'x']
    const result = orderGames(games, saved)
    expect(ids(result).sort()).toEqual(ids(games).sort())
    expect(saved).toEqual(['yugioh', 'yugioh', 'x'])
  })
})
