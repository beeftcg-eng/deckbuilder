import { describe, expect, it } from 'vitest'
import { MAX_BATCHES, batchCopies, cardIdsOfGame, newBatch, removalItems, sanitizeCollectionBatches, undoItems, withBatch } from './collectionBatches'

const GAMES = ['pokemon', 'onepiece', 'riftbound', 'mtg', 'yugioh'] as const

describe('collection batches', () => {
  it('merges repeats of a card and drops cards that net to nothing', () => {
    const batch = newBatch('riftbound', 'scan', [
      { cardId: 'riftbound:a', quantity: 1 },
      { cardId: 'riftbound:b', quantity: 1 },
      { cardId: 'riftbound:a', quantity: 2 },
      { cardId: 'riftbound:b', quantity: -1 },
    ])
    expect(batch?.items).toEqual([{ cardId: 'riftbound:a', quantity: 3 }])
    expect(newBatch('riftbound', 'scan', [{ cardId: 'riftbound:a', quantity: 1 }, { cardId: 'riftbound:a', quantity: -1 }])).toBeNull()
  })

  it('counts copies added and removed', () => {
    const batch = newBatch('mtg', 'import', [
      { cardId: 'mtg:a', quantity: 4 },
      { cardId: 'mtg:b', quantity: -2 },
    ])!
    expect(batchCopies(batch)).toEqual({ added: 4, removed: 2 })
  })

  it('undoes an addition only as far as the copies are still owned', () => {
    const batch = newBatch('mtg', 'import', [
      { cardId: 'mtg:a', quantity: 4 },
      { cardId: 'mtg:b', quantity: 2 },
      { cardId: 'mtg:c', quantity: 1 },
    ])!
    expect(undoItems(batch, { 'mtg:a': 6, 'mtg:b': 1 })).toEqual([
      { cardId: 'mtg:a', quantity: -4 },
      { cardId: 'mtg:b', quantity: -1 },
    ])
  })

  it('undoes a removal by putting the copies back', () => {
    const batch = newBatch('mtg', 'clear', removalItems({ 'mtg:a': 3, 'mtg:b': 1 }, ['mtg:a', 'mtg:b', 'mtg:gone']))!
    expect(batch.items).toEqual([
      { cardId: 'mtg:a', quantity: -3 },
      { cardId: 'mtg:b', quantity: -1 },
    ])
    expect(undoItems(batch, {})).toEqual([
      { cardId: 'mtg:a', quantity: 3 },
      { cardId: 'mtg:b', quantity: 1 },
    ])
  })

  it("lists one game's cards, including ones the card data doesn't have", () => {
    expect(cardIdsOfGame({ 'mtg:a': 1, 'pokemon:b': 2, 'mtg:unknown-id': 1 }, 'mtg')).toEqual(['mtg:a', 'mtg:unknown-id'])
  })

  it('keeps only the newest batches', () => {
    let list = [] as ReturnType<typeof withBatch>
    for (let i = 0; i < MAX_BATCHES + 5; i++) list = withBatch(list, newBatch('mtg', 'scan', [{ cardId: `mtg:${i}`, quantity: 1 }])!)
    expect(list).toHaveLength(MAX_BATCHES)
    expect(list[0].items[0].cardId).toBe(`mtg:${MAX_BATCHES + 4}`)
  })

  it('reads back only well-formed batches', () => {
    const good = newBatch('pokemon', 'delete', [{ cardId: 'pokemon:x', quantity: -2 }])!
    const read = sanitizeCollectionBatches(
      [
        good,
        { ...good, id: 'bad-game', gameId: 'chess' },
        { ...good, id: 'bad-source', source: 'magic' },
        { ...good, id: 'bad-date', at: 'yesterday' },
        { ...good, id: 'no-items', items: [{ cardId: 'pokemon:x', quantity: 0 }, { cardId: 5, quantity: 1 }] },
        null,
      ],
      GAMES,
    )
    expect(read).toEqual([good])
    expect(sanitizeCollectionBatches('nope', GAMES)).toEqual([])
  })
})
