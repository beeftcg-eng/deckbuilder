import type { Card, Deck } from './types'
import type { GameAdapter } from './games/types'

export function buildExportText(deck: Deck, adapter: GameAdapter, formatLabel: string, cardsById: Map<string, Card>): string {
  const header = [`${deck.name}`, `${adapter.name} — ${formatLabel}`, `Exported ${new Date().toLocaleString()}`, '']
  return header.join('\n') + '\n' + adapter.formatDecklistText(deck, cardsById)
}
