import type { Deck, GameId } from './types'

/**
 * The deck being edited, but only when it belongs to the game being browsed. The selected deck persists when you
 * switch game tabs, and using it anyway meant another game's format was applied to this game's cards — Magic and
 * Pokémon store legality per card under their own format names, so a Riftbound deck ("constructed") hid every
 * one of their cards — and a click on "+" could add a card of one game to a deck of another.
 */
export function currentDeckFor(decks: readonly Deck[], currentDeckId: string | null, gameId: GameId): Deck | undefined {
  if (!currentDeckId) return undefined
  const deck = decks.find((d) => d.id === currentDeckId)
  return deck && deck.gameId === gameId ? deck : undefined
}
