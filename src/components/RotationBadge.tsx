import { useMemo } from 'react'
import { deckRotation, futureKnownFor } from '../shared/rotation'
import type { Card, Deck, Format } from '../shared/types'
import { getLanguage, t } from '../shared/i18n'

/** "⟳ 6 rotating": the deck's cards that leave the format at its next rotation (shared/rotation.ts). Nothing when none do. */
export function RotationBadge({ deck, format, cardsById }: { deck: Pick<Deck, 'zones'>; format: Format | undefined; cardsById: Map<string, Card> | undefined }) {
  const rotation = useMemo(() => (cardsById ? deckRotation(deck, format, cardsById, futureKnownFor(cardsById)) : null), [deck, format, cardsById])
  if (!rotation) return null
  const date = rotation.date ? new Date(`${rotation.date}T12:00:00`).toLocaleDateString(getLanguage(), { dateStyle: 'medium' }) : null
  const list = rotation.cards.map((c) => `${c.quantity} ${c.card.name}`).join('\n')
  return (
    <span className="rotation-badge" title={`${date ? t.rotation.titleOn(date) : t.rotation.title}\n${list}`}>
      {t.rotation.badge(rotation.copies)}
    </span>
  )
}
