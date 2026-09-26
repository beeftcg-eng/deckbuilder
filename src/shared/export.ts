import type { Card, Deck, GameId } from './types'
import type { GameAdapter } from './games/types'
import { getAdapter } from './games/registry'

export function buildExportText(deck: Deck, adapter: GameAdapter, formatLabel: string, cardsById: Map<string, Card>): string {
  if (adapter.plainExportText) return adapter.formatDecklistText(deck, cardsById) + '\n'
  const header = [`${deck.name}`, `${adapter.name} — ${formatLabel}`, `Exported ${new Date().toLocaleString()}`, '']
  return header.join('\n') + '\n' + adapter.formatDecklistText(deck, cardsById)
}

export interface ResolvedWishlistEntry {
  card: Card
  quantity: number
}

function groupByGame(entries: ResolvedWishlistEntry[]): Map<GameId, ResolvedWishlistEntry[]> {
  const byGame = new Map<GameId, ResolvedWishlistEntry[]>()
  for (const entry of entries) {
    const list = byGame.get(entry.card.gameId) ?? []
    list.push(entry)
    byGame.set(entry.card.gameId, list)
  }
  return byGame
}

export function buildWishlistExportText(entries: ResolvedWishlistEntry[]): string {
  const total = entries.reduce((sum, e) => sum + e.quantity, 0)
  const lines = ['Card Wishlist', `${total} card${total === 1 ? '' : 's'} wanted`, `Exported ${new Date().toLocaleString()}`, '']
  for (const [gameId, list] of groupByGame(entries)) {
    lines.push(getAdapter(gameId).shortName)
    for (const { card, quantity } of list) {
      lines.push(`${quantity}x ${card.name} (${card.setCode} #${card.number})`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
