import type { Card } from '../shared/types'

/** A deck's thumbnail: the top of its icon card (where a card's art is), or a placeholder tile if there isn't one yet. */
export function DeckIcon({ card, name, size = 34 }: { card: Card | null; name: string; size?: number }) {
  const src = card?.imageUrlSmall ?? card?.imageUrl ?? null
  const style = { width: size, height: size }
  if (!src) {
    return (
      <span className="deck-icon deck-icon-empty" style={style} aria-hidden>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </span>
    )
  }
  return <img className="deck-icon" style={style} src={src} alt="" loading="lazy" title={card?.name} />
}
