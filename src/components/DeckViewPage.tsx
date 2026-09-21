import { useAppStore, useCardsById } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { currentDeckFor } from '../shared/decks'
import { DeckFullView } from './DeckFullView'
import type { GameId } from '../shared/types'

/** What you see when you select a deck: the finished deck, with an "Edit deck" button to get to the editor. */
export function DeckViewPage() {
  const deck = useAppStore((s) => currentDeckFor(s.decks, s.currentDeckId, s.currentGameId))
  if (!deck) return null
  return <LoadedDeckView key={deck.id} deckId={deck.id} gameId={deck.gameId} />
}

function LoadedDeckView({ deckId, gameId }: { deckId: string; gameId: GameId }) {
  const deck = useAppStore((s) => s.decks.find((d) => d.id === deckId))
  const formats = useAppStore((s) => s.formats[gameId])
  const setDeckViewing = useAppStore((s) => s.setDeckViewing)
  const cardsById = useCardsById(gameId)
  if (!deck) return null
  const gameFormats = formats ?? getAdapter(gameId).defaultFormats
  const format = gameFormats.find((f) => f.id === deck.formatId) ?? gameFormats[0]
  return <DeckFullView deck={deck} format={format} cardsById={cardsById} onEdit={() => setDeckViewing(false)} />
}
