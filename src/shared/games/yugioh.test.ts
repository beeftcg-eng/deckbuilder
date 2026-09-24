import { describe, expect, it } from 'vitest'
import { normalizeCard, isExtraDeckType, yugiohAdapter } from './yugioh'
import { RAW } from './yugiohFixtures'
import { checkDeckLegality } from '../legality'
import { parseDecklistText } from '../importDeck'
import { buildExportText } from '../export'
import { catalogOf, makeCard, makeDeck } from '../testFixtures'
import type { Card, Format } from '../types'

const card = (key: string): Card => {
  const result = normalizeCard(RAW[key])
  if (result.length === 0) throw new Error(`${key} was not kept`)
  return result[0] // the first printing; fields that don't vary by printing are identical across the rest
}

describe('normalizeCard', () => {
  it('maps a monster: category, type tags, attribute, level and price data', () => {
    const c = card('normal')
    expect(c).toMatchObject({ id: 'yugioh:89631139', gameId: 'yugioh', sourceId: '89631139', name: 'Blue-Eyes White Dragon', category: 'Monster', colors: ['Light'], cost: '8', orientation: 'portrait' })
    expect(c.subtypes).toEqual(['Dragon', 'Normal'])
    expect(c.text).toContain('Normal Monster · Dragon · Light · Level 8 · ATK 3000 / DEF 2500')
  })

  it('points images at the app’s own cache, never straight at the image host', () => {
    const c = card('normal')
    expect(c.imageUrl).toBe('dbimg://ygo/full/89631139.jpg')
    expect(c.imageUrlSmall).toBe('dbimg://ygo/small/89631139.jpg')
    expect(JSON.stringify(c)).not.toContain('images.ygoprodeck.com')
  })

  it('classifies spells and traps, which have no attribute or level', () => {
    expect(card('quickplay')).toMatchObject({ category: 'Spell', colors: [], cost: null })
    expect(card('trap')).toMatchObject({ category: 'Trap', colors: [], cost: null })
    expect(card('quickplay').text?.split('\n')[0]).toBe('Quick-Play Spell')
  })

  it('puts Fusion, Synchro, XYZ, Link and Pendulum-variant monsters in the Extra Deck, and nothing else', () => {
    for (const key of ['fusion', 'synchro', 'xyz', 'link']) expect(card(key).subtypes, key).toContain('Extra Deck')
    for (const key of ['normal', 'pendulum', 'quickplay', 'trap', 'limited']) expect(card(key).subtypes, key).not.toContain('Extra Deck')
    expect(['Pendulum Effect Fusion Monster', 'XYZ Pendulum Effect Monster', 'Synchro Pendulum Effect Monster', 'Link Monster'].every(isExtraDeckType)).toBe(true)
    expect(['Pendulum Effect Monster', 'Normal Tuner Monster', 'Spell Card', 'Trap Card'].some(isExtraDeckType)).toBe(false)
  })

  it('describes ranks, link ratings and pendulum scales', () => {
    expect(card('xyz').text).toContain('Rank ')
    expect(card('link').text).toContain('Link-')
    expect(card('pendulum').text).toContain('Scale ')
  })

  it('reads each format’s legality and the three ban-list levels', () => {
    expect(card('normal').legality).toEqual({ tcg: 'legal', ocg: 'legal', goat: 'legal' })
    expect(card('spell_forbidden_tcg').legality).toEqual({ tcg: 'banned', ocg: 'banned', goat: 'restricted' })
    expect(card('trap').legality).toMatchObject({ tcg: 'restricted', ocg: 'restricted', goat: 'legal' })
    expect(card('semi').legality).toMatchObject({ tcg: 'semi-restricted', ocg: 'legal' })
  })

  it('leaves out formats a card was never printed in, and lists an unsetted OCG card only for the OCG', () => {
    expect(card('fusion').legality).toEqual({ tcg: 'legal', ocg: 'legal' }) // not in the GOAT era
    expect(card('ocg_only').legality).toEqual({ ocg: 'legal' })
    expect(card('ocg_only')).toMatchObject({ setId: 'none', setName: 'No set listed', rarity: null })
  })

  it('creates one card per set/rarity printing, each with that printing’s own price', () => {
    const printings = normalizeCard(RAW.normal)
    expect(printings).toHaveLength(2)
    expect(printings[0]).toMatchObject({ setId: 'CT13', setName: '2016 Mega-Tins', setCode: 'CT13', number: 'EN008', rarity: 'Ultra Rare', price: 74.49 })
    expect(printings[1]).toMatchObject({ setId: 'CT14', setName: '2017 Mega-Tins', setCode: 'CT14', number: 'EN002', rarity: 'Secret Rare', price: 27.92 })
    // every printing is still the same card for deckbuilding/copy-limit purposes
    expect(new Set(printings.map((p) => p.id))).toEqual(new Set([`yugioh:${RAW.normal.id}`]))
    expect(new Set(printings.map((p) => p.sourceId))).toEqual(new Set([String(RAW.normal.id)]))
  })

  it('falls back to the card’s general TCGplayer price only when there is a single printing to be unambiguous about', () => {
    // single_printing_zero_price has one printing at "0" - the card-wide fallback is safe to use.
    expect(normalizeCard(RAW.single_printing_zero_price)[0].price).toBe(2.5)
    // spell_forbidden_tcg has two zero-priced printings of different rarities (Starlight Rare,
    // Mosaic Rare) - falling back would show both the same borrowed price, misrepresenting
    // exactly the kind of premium-rarity-shows-a-common's-price bug reported by a friend.
    const printings = normalizeCard(RAW.spell_forbidden_tcg)
    expect(printings.every((p) => p.price === null)).toBe(true)
  })

  it('gives an OCG-only card (no card_sets at all) one placeholder printing', () => {
    expect(normalizeCard(RAW.ocg_only)).toHaveLength(1) // shape of that placeholder is checked above ("lists an unsetted OCG card...")
  })

  it('skips Skill Cards, which are not deck cards, but keeps Tokens for collection/wishlist tracking', () => {
    expect(normalizeCard(RAW.skill)).toEqual([])
    const [tokenCard] = normalizeCard(RAW.token)
    expect(tokenCard).toMatchObject({ name: 'Ancient Gear Token', category: 'Token' })
    expect(tokenCard.text).toContain('Token · Machine') // still gets its race/attribute/ATK-DEF facts like a monster
  })

  it('rejects a rarity string that is just a number, upstream data noise rather than a real rarity', () => {
    expect(normalizeCard(RAW.bad_rarity)[0].rarity).toBeNull()
  })

  it('collapses a duplicate (set code, rarity) row in card_sets into one printing', () => {
    expect(normalizeCard(RAW.duplicate_printing)).toHaveLength(1)
  })

  it('lists other known artworks separately from the printing image, when the card has more than one', () => {
    expect(card('normal').altImageUrlsSmall).toBeUndefined() // fixture only has one card_images entry
    expect(card('multi_art').altImageUrlsSmall).toEqual(['dbimg://ygo/small/44556678.jpg', 'dbimg://ygo/small/44556679.jpg'])
  })
})

describe('Yu-Gi-Oh! Tokens stay out of every deck zone', () => {
  it('excludes Tokens from Main, Extra and Side Deck matching', () => {
    const [tokenCard] = normalizeCard(RAW.token)
    for (const zone of yugiohAdapter.deckRules.zones) expect(zone.match(tokenCard), zone.id).toBe(false)
  })

  it('hides Tokens from the default browse view via mainDeckExcludedCategories', () => {
    expect(yugiohAdapter.mainDeckExcludedCategories).toContain('Token')
  })
})

describe('Yu-Gi-Oh! deck rules', () => {
  const fmt = (id: string): Format => yugiohAdapter.defaultFormats.find((f) => f.id === id)!
  const spell = (name: string, over: Partial<Card> = {}) => makeCard('yugioh', { name, category: 'Spell', legality: { tcg: 'legal', ocg: 'legal', goat: 'legal' }, ...over })
  const extra = (name: string) => spell(name, { category: 'Monster', subtypes: ['Dragon', 'Extra Deck'] })
  const errors = (deck: ReturnType<typeof makeDeck>, cards: Card[], formatId = 'tcg') => checkDeckLegality({ ...deck, formatId }, yugiohAdapter, fmt(formatId), catalogOf(cards)).issues.map((i) => i.message)
  const fillers = Array.from({ length: 14 }, (_, i) => spell(`Filler ${i}`))
  const forty = (): [Card, number][] => [...fillers.slice(0, 13).map((c): [Card, number] => [c, 3]), [fillers[13], 1]] // 40 cards

  it('accepts a legal 40-card deck with an Extra and Side Deck', () => {
    const e = extra('Fusion A')
    const deck = makeDeck('yugioh', { main: forty(), extra: [[e, 3]], sideboard: [[fillers[0], 0]] })
    expect(errors(deck, [...fillers, e])).toEqual([])
  })

  it('needs 40–60 main cards, and at most 15 in each of the Extra and Side Decks', () => {
    expect(errors(makeDeck('yugioh', { main: [[fillers[0], 3]] }), fillers).join()).toContain('Main Deck must have at least 40 cards (currently 3)')
    const sixtyOne = makeDeck('yugioh', { main: [...fillers.slice(0, 13).map((c): [Card, number] => [c, 3]), [fillers[13], 3]] }) // 42
    expect(errors(sixtyOne, fillers)).toEqual([])
    const manyExtras = Array.from({ length: 16 }, (_, i) => extra(`E${i}`))
    const deck = makeDeck('yugioh', { main: forty(), extra: manyExtras.map((c): [Card, number] => [c, 1]) })
    expect(errors(deck, [...fillers, ...manyExtras])).toContain('Extra Deck must have at most 15 cards (currently 16).')
  })

  it('keeps Extra Deck monsters out of the Main Deck', () => {
    const e = extra('Fusion A')
    const deck = makeDeck('yugioh', { main: [...forty(), [e, 1]] })
    expect(errors(deck, [...fillers, e])).toContain('Fusion A does not belong in Main Deck.')
  })

  it('allows 3 copies by name across all three decks together', () => {
    const c = spell('Ash Blossom')
    const deck = makeDeck('yugioh', { main: [...forty().slice(0, 12), [c, 3]], sideboard: [[c, 1]] })
    expect(errors(deck, [...fillers, c])).toContain('Ash Blossom: 4 copies exceeds the 3-copy limit.')
  })

  it('applies the banlist of the deck’s format: Forbidden, Limited (1) and Semi-Limited (2)', () => {
    const pot = spell('Pot of Greed', { legality: { tcg: 'banned', ocg: 'banned', goat: 'restricted' } })
    const solemn = spell('Solemn Judgment', { legality: { tcg: 'restricted', ocg: 'restricted', goat: 'legal' } })
    const arthalion = spell('Dracotail Arthalion', { legality: { tcg: 'semi-restricted', ocg: 'legal' } })
    const deck = makeDeck('yugioh', { main: [...forty().slice(0, 10), [pot, 1], [solemn, 2], [arthalion, 3]] })
    const tcg = errors(deck, [...fillers, pot, solemn, arthalion], 'tcg')
    expect(tcg).toContain('Pot of Greed is banned in TCG.')
    expect(tcg).toContain('Solemn Judgment is restricted to 1 copy in TCG.')
    expect(tcg).toContain('Dracotail Arthalion is limited to 2 copies in TCG.')
    const ocg = errors(deck, [...fillers, pot, solemn, arthalion], 'ocg')
    expect(ocg).toContain('Pot of Greed is banned in OCG.')
    expect(ocg.some((m) => m.startsWith('Dracotail'))).toBe(false) // the OCG list differs
    expect(errors(makeDeck('yugioh', { main: [...forty().slice(0, 12), [arthalion, 2]] }), [...fillers, arthalion], 'tcg').some((m) => m.startsWith('Dracotail'))).toBe(false)
  })

  it('rejects a card that was never printed in the format', () => {
    const modern = spell('Modern Card', { legality: { tcg: 'legal', ocg: 'legal' } }) // no goat entry
    expect(errors(makeDeck('yugioh', { main: [...forty().slice(0, 12), [modern, 1]] }), [...fillers, modern], 'goat')).toContain('Modern Card is not legal in GOAT (2005).')
  })

  it('opens with five cards and lists Main / Extra / Side Deck', () => {
    expect(yugiohAdapter.openingHandSize).toBe(5)
    expect(yugiohAdapter.deckRules.zones.map((z) => z.label)).toEqual(['Main Deck', 'Extra Deck', 'Side Deck'])
  })
})

describe('Yu-Gi-Oh! decklists', () => {
  const be = card('normal')
  const ultimate = card('fusion')
  const pot = card('spell_forbidden_tcg')
  const catalog = catalogOf([be, ultimate, pot])
  const q = (c: Card, quantity: number) => ({ cardId: c.id, quantity })

  it('exports Main Deck / Extra Deck / Side Deck sections', () => {
    const deck = { ...makeDeck('yugioh', { main: [[be, 3]], extra: [[ultimate, 1]], sideboard: [[pot, 2]] }), formatId: 'tcg' }
    expect(yugiohAdapter.formatDecklistText(deck, catalog)).toBe('Main Deck\n3 Blue-Eyes White Dragon\n\nExtra Deck\n1 Blue-Eyes Ultimate Dragon\n\nSide Deck\n2 Pot of Greed')
  })

  it('lists printings of one card as one line', () => {
    const be2 = { ...be, id: `${be.id}~SDK~Common`, setId: 'SDK', setCode: 'SDK', rarity: 'Common' }
    const be3 = { ...be, id: `${be.id}~LC01~Ultra Rare`, setId: 'LC01', setCode: 'LC01', rarity: 'Ultra Rare' }
    const deck = { ...makeDeck('yugioh', { main: [[be, 1], [be2, 1], [be3, 1]] }), formatId: 'tcg' }
    expect(yugiohAdapter.formatDecklistText(deck, catalogOf([be, be2, be3]))).toBe('Main Deck\n3 Blue-Eyes White Dragon')
  })

  it('round-trips its own export', () => {
    const deck = { ...makeDeck('yugioh', { main: [[be, 3]], extra: [[ultimate, 1]], sideboard: [[pot, 2]] }), formatId: 'tcg' }
    const parsed = parseDecklistText(buildExportText(deck, yugiohAdapter, 'TCG', catalog), yugiohAdapter, catalog, 'tcg')
    expect(parsed.zones).toEqual({ main: [q(be, 3)], extra: [q(ultimate, 1)], sideboard: [q(pot, 2)] })
    expect(parsed.name).toBe('Test Deck')
  })

  it('reads a .ydk file: one passcode per line, under #main / #extra / !side', () => {
    const ydk = ['#created by Someone', '#main', be.sourceId, be.sourceId, be.sourceId, '#extra', ultimate.sourceId, '!side', pot.sourceId, pot.sourceId, '9999999999'].join('\n')
    const parsed = parseDecklistText(ydk, yugiohAdapter, catalog, 'tcg')
    expect(parsed.zones).toEqual({ main: [q(be, 3)], extra: [q(ultimate, 1)], sideboard: [q(pot, 2)] })
    expect(parsed.unmatched).toEqual(['9999999999'])
  })

  it('puts an Extra Deck monster in the Extra Deck even when a list files it under Main', () => {
    const parsed = parseDecklistText('Main Deck\n3 Blue-Eyes White Dragon\n1 Blue-Eyes Ultimate Dragon', yugiohAdapter, catalog, 'tcg')
    expect(parsed.zones).toEqual({ main: [q(be, 3)], extra: [q(ultimate, 1)] })
  })
})
