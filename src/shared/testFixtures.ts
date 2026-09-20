import type { Card, Deck, GameId } from './types'

let counter = 0

/** Minimal Card for tests; any field can be overridden. `id` defaults to `<gameId>:<sourceId>`. */
export function makeCard(gameId: GameId, overrides: Partial<Card> & { name: string }): Card {
  counter += 1
  const sourceId = overrides.sourceId ?? `src-${counter}`
  return {
    id: `${gameId}:${sourceId}`,
    gameId,
    sourceId,
    imageUrl: null,
    imageUrlSmall: null,
    orientation: 'portrait',
    setId: 'set',
    setName: 'Set',
    setCode: 'SET',
    number: String(counter),
    rarity: null,
    category: 'Unit',
    subtypes: [],
    colors: [],
    cost: null,
    text: null,
    legality: null,
    ...overrides,
  }
}

export function catalogOf(cards: Card[]): Map<string, Card> {
  return new Map(cards.map((c) => [c.id, c]))
}

export function makeDeck(gameId: GameId, zones: Record<string, [Card, number][]>, freeTextZones: Deck['freeTextZones'] = {}): Deck {
  return {
    id: 'deck-1',
    gameId,
    name: 'Test Deck',
    formatId: 'standard',
    zones: Object.fromEntries(Object.entries(zones).map(([zone, list]) => [zone, list.map(([card, quantity]) => ({ cardId: card.id, quantity }))])),
    freeTextZones,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}
