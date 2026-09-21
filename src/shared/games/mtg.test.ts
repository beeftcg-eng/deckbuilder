import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'
import { canBeCommander, mtgAdapter, normalizeCard, readBulkCards } from './mtg'
import type { ScryfallCard } from './mtg'
import { RAW, RAW_FUTURE, RAW_STICKER, RAW_TOKEN, RAW_UNPLAYABLE } from './mtgFixtures'
import type { Card } from '../types'

function card(name: string): Card {
  const result = normalizeCard(RAW[name])
  if (!result) throw new Error(`${name} was not kept`)
  return result
}

describe('normalizeCard', () => {
  it('keys a card by its oracle id, not by the printing Scryfall happens to show', () => {
    const llanowar = card('Llanowar Elves')
    expect(llanowar.id).toBe(`mtg:${RAW['Llanowar Elves'].oracle_id}`)
    expect(llanowar.sourceId).toBe(RAW['Llanowar Elves'].oracle_id)
    // A different printing of the same card (a new id, another set) must still be the same card.
    const reprint: ScryfallCard = { ...RAW['Llanowar Elves'], id: 'a-different-printing-id', set: 'zzz', collector_number: '999' }
    expect(normalizeCard(reprint)?.id).toBe(llanowar.id)
  })

  it('maps a plain creature', () => {
    const c = card('Llanowar Elves')
    expect(c).toMatchObject({
      gameId: 'mtg',
      name: 'Llanowar Elves',
      category: 'Creature',
      subtypes: ['Elf', 'Druid'],
      colors: ['Green'],
      colorIdentity: ['Green'],
      cost: '1',
      orientation: 'portrait',
    })
    expect(c.legality).toMatchObject({ standard: 'legal', commander: 'legal' })
    expect(c.imageUrl).toContain('scryfall.io')
    expect(c.imageUrlSmall).toContain('small')
    expect(c.text).toContain('{T}: Add {G}.')
    expect(c.price).toBeGreaterThan(0)
  })

  it('treats a basic land as a colorless-cost Land with a color identity, kept out of the curve', () => {
    const forest = card('Forest')
    expect(forest.category).toBe('Land')
    expect(forest.subtypes).toContain('Basic')
    expect(forest.cost).toBeNull()
    expect(forest.colors).toEqual([])
    expect(forest.colorIdentity).toEqual(['Green'])
  })

  it('reads a double-faced card from its front face and describes both faces', () => {
    const delver = card('Delver of Secrets // Insectile Aberration')
    expect(delver.category).toBe('Creature')
    expect(delver.colors).toEqual(['Blue'])
    expect(delver.cost).toBe('1')
    expect(delver.imageUrl).toContain('scryfall.io') // the top level has no image; the front face does
    expect(delver.text).toContain('Delver of Secrets')
    expect(delver.text).toContain('Insectile Aberration')
    expect(delver.text).toContain('Flying')
  })

  it('handles split and adventure cards', () => {
    const fireIce = card('Fire // Ice')
    expect(fireIce.category).toBe('Instant')
    expect(fireIce.colors).toEqual(['Red', 'Blue'])
    expect(fireIce.cost).toBe('4') // combined mana value, as Scryfall reports it
    const giant = card('Bonecrusher Giant // Stomp')
    expect(giant.category).toBe('Creature')
    expect(giant.text).toContain('Stomp')
  })

  it('categorises by the deck-site convention and keeps the other type words searchable', () => {
    const vents = card('Steam Vents')
    expect(vents.category).toBe('Land')
    expect(vents.subtypes).toEqual(expect.arrayContaining(['Island', 'Mountain']))
    expect(vents.colors).toEqual([]) // a land has no color of its own…
    expect(vents.colorIdentity).toEqual(['Red', 'Blue']) // …but it has an identity
    expect(card('Sol Ring').category).toBe('Artifact')
    expect(card('Teferi, Temporal Archmage').category).toBe('Planeswalker')
  })

  it('records per-format legality including banned and restricted, and leaves formats it is not legal in out', () => {
    const solRing = card('Sol Ring')
    expect(solRing.legality?.standard).toBeUndefined()
    expect(solRing.legality?.vintage).toBe('restricted')
    expect(card('Ancestral Recall').legality).toMatchObject({ vintage: 'restricted', commander: 'banned' })
  })

  it('uses the foil price when a card has no regular one, and null when it has no price at all', () => {
    const foilOnly: ScryfallCard = { ...RAW['Llanowar Elves'], prices: { usd: null, usd_foil: '1.50' } }
    expect(normalizeCard(foilOnly)?.price).toBe(1.5)
    expect(normalizeCard({ ...RAW['Llanowar Elves'], prices: {} })?.price).toBeNull()
    expect(normalizeCard({ ...RAW['Llanowar Elves'], prices: { usd: '0.00' } })?.price).toBeNull()
  })

  it('leaves out tokens, sticker sheets and cards no supported format can play, but keeps upcoming-Standard cards', () => {
    expect(normalizeCard(RAW_TOKEN)).toBeNull()
    expect(normalizeCard(RAW_STICKER)).toBeNull()
    expect(normalizeCard(RAW_UNPLAYABLE)).toBeNull()
    const upcoming = normalizeCard(RAW_FUTURE)
    expect(upcoming).not.toBeNull()
    expect(upcoming?.legality).toEqual({})
  })
})

describe('commander eligibility', () => {
  it('accepts legendary creatures and cards that say they can be your commander', () => {
    expect(canBeCommander(card("Atraxa, Praetors' Voice"))).toBe(true)
    expect(canBeCommander(card('Teferi, Temporal Archmage'))).toBe(true) // a planeswalker whose text allows it
  })

  it('rejects everything else', () => {
    expect(canBeCommander(card('Llanowar Elves'))).toBe(false) // creature, not legendary
    expect(canBeCommander(card('Sol Ring'))).toBe(false)
    expect(canBeCommander(card('Forest'))).toBe(false)
  })
})

describe('copy limits', () => {
  const limit = (name: string) => mtgAdapter.copyLimitFor?.(card(name))
  it('lets basic lands and cards that say so run any number', () => {
    expect(limit('Forest')).toBe(Infinity)
    expect(limit('Relentless Rats')).toBe(Infinity)
  })
  it('applies "up to N" limits from the card text', () => {
    expect(limit('Seven Dwarves')).toBe(7)
    expect(limit('Nazgûl')).toBe(9)
  })
  it('has no override for ordinary cards', () => {
    expect(limit('Llanowar Elves')).toBeNull()
    expect(limit('Steam Vents')).toBeNull() // a nonbasic land
  })
})

describe('mtg deck text', () => {
  it('exports Commander / Deck / Sideboard sections sorted by name', () => {
    const bolt = { ...card('Llanowar Elves'), name: 'Zap' }
    const rats = card('Relentless Rats')
    const deck = {
      id: 'd',
      gameId: 'mtg' as const,
      name: 'X',
      formatId: 'commander',
      zones: { commander: [{ cardId: rats.id, quantity: 1 }], main: [{ cardId: bolt.id, quantity: 2 }, { cardId: card('Sol Ring').id, quantity: 1 }], sideboard: [] },
      freeTextZones: {},
      createdAt: '',
      updatedAt: '',
    }
    const byId = new Map([bolt, rats, card('Sol Ring')].map((c) => [c.id, c]))
    expect(mtgAdapter.formatDecklistText(deck, byId)).toBe('Commander\n1 Relentless Rats\n\nDeck\n1 Sol Ring\n2 Zap')
  })
})

describe('readBulkCards', () => {
  const lines = [RAW['Llanowar Elves'], RAW_TOKEN, RAW['Sol Ring'], RAW['Forest']].map((c) => JSON.stringify(c))

  function bulkResponse(text: string, chunkSize = text.length): Response {
    const bytes = gzipSync(text)
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(new Uint8Array(bytes.subarray(i, i + chunkSize)))
        controller.close()
      },
    })
    return new Response(stream, { headers: { 'content-length': String(bytes.length) } })
  }

  it('streams gzipped JSON Lines into cards, skipping non-deck cards and a damaged line', async () => {
    const text = [lines[0], 'not json at all', lines[1], lines[2], lines[3]].join('\n') // no trailing newline
    const progress: { loaded: number; total: number }[] = []
    const cards = await readBulkCards(bulkResponse(text, 40), (p) => progress.push(p)) // 40-byte chunks split lines mid-way
    expect(cards.map((c) => c.name)).toEqual(['Llanowar Elves', 'Sol Ring', 'Forest'])
    expect(progress.at(-1)).toEqual({ loaded: 3, total: 3 })
    expect(progress.every((p) => p.total >= p.loaded)).toBe(true)
  })

  it('fails loudly instead of caching an empty catalog', async () => {
    await expect(readBulkCards(bulkResponse([lines[1], 'garbage'].join('\n')), () => {})).rejects.toThrow(/no cards/)
  })
})
