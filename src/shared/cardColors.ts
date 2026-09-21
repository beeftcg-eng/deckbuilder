import type { Card } from './types'

/** The colors that count for deck color-locking and the browser's color filter: color identity where a game has one, else the card's colors. */
export function identityColors(card: Card): string[] {
  return card.colorIdentity ?? card.colors
}
