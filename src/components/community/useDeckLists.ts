import { useMemo } from 'react'
import { useCardsById } from '../../state/useAppStore'
import { useCommunityLists } from '../../state/communityLists'
import { archetypeOf, communityGame, isCommunityGame, type CommunityGameId } from '../../shared/communityGames'
import { listsForArchetype, type ListDeck } from '../../shared/communityMeta'
import type { Deck } from '../../shared/types'

/**
 * The Community lists like a deck of yours (communityGames.ts archetypeOf): those with its Legend or
 * Leader, or for Pokémon the archetype whose lists share the most of its cards. The lists are read
 * only once `enabled`. `decks` is empty until they are, or when none fit.
 */
export function useDeckLists(deck: Deck, enabled: boolean) {
  const supported = isCommunityGame(deck.gameId)
  const gameId: CommunityGameId = supported ? (deck.gameId as CommunityGameId) : 'riftbound'
  const game = communityGame(gameId)
  const cardsById = useCardsById(gameId)
  const { lists } = useCommunityLists(gameId, enabled && supported)
  const index = useMemo(() => game.index(cardsById.values()), [game, cardsById])
  // Pokémon's archetype comes from the cards, so it follows the deck's edits; the others only from the Legend or Leader.
  const identityId = game.identityZone ? (deck.zones[game.identityZone]?.[0]?.cardId ?? '') : null
  const cardsKey = game.identityZone ? identityId : deck.zones
  const archetype = useMemo(
    () => (supported && lists && cardsById.size ? archetypeOf(game, deck, cardsById, lists, index) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supported, lists, cardsById, index, game, cardsKey],
  )
  const decks = useMemo((): ListDeck[] => listsForArchetype(lists ?? [], archetype, index), [lists, archetype, index])
  const identityCard = identityId ? cardsById.get(identityId) : undefined
  return { supported, gameId, game, cardsById, index, lists, archetype, decks, identityCard }
}
