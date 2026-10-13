import { describe, expect, it } from 'vitest'
import { cardCode, decodeDeckCode, deckCodeToText, deckToCode, encodeDeckCode } from './riftboundDeckCode'
import { makeCard } from './testFixtures'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
function base32(bytes: number[]): string {
  let out = ''
  let buffer = 0
  let bits = 0
  for (const b of bytes) {
    buffer = (buffer << 8) | b
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += BASE32[(buffer >> bits) & 31]
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31]
  return out
}

/** A Kennen deck from RiftAtlas (Haven Online Challenger Series #5, 1st): version 3, 66 cards with the sideboard. */
const KENNEN =
  'CMAAAAAAAEAQAAGWAEAAAAABAEAABJQBAMCQAAGCAHNADYQB6IA7KAIDAUAF63M4AEBAMADLQEAQEAIDACIQCAIGABUQIBAAAC6AD2IBUYBKUAQCAMAIWANQAEBAIAFJAHJACAQFACDQDGYBAEAQKADGAIAQIAFEAEAQKAEDAEAQGAAAXQA52APAAEAQKAEHAE'

describe('Riftbound deck codes', () => {
  it('reads a real deck code', () => {
    const deck = decodeDeckCode(KENNEN)
    const total = (entries: { count: number }[]) => entries.reduce((n, e) => n + e.count, 0)
    expect(total(deck.main)).toBe(56)
    expect(total(deck.sideboard)).toBe(10)
    expect(deck.main).toContainEqual({ code: 'VEN-155', count: 1 })
    expect(deck.main).toContainEqual({ code: 'OGN-214', count: 8 })
    expect(deck.extraLegends).toEqual([])
  })

  it('reads version 5: Spotlight cards, runes, variants and the sideboard', () => {
    // format 1 / version 5, numbers flagged; main: one count (3), one group (VEN, regular) of SP1 and R01;
    // sideboard: one count (1), one group (UNL, Signature) of 229; no chosen Champion.
    const code = base32([0x15, 1, 1, 3, 1, 2, 5, 0, 2, 1, 1, 1, 1, 1, 1, 1, 4, 2, 0, 229, 1, 0])
    expect(decodeDeckCode(code)).toEqual({
      main: [
        { code: 'VEN-SP1', count: 3 },
        { code: 'VEN-R01', count: 3 },
      ],
      sideboard: [{ code: 'UNL-229s', count: 1 }],
      extraLegends: [],
    })
  })

  it('refuses what isn’t a deck code', () => {
    expect(() => decodeDeckCode('hello there')).toThrow()
    expect(() => decodeDeckCode(base32([0x27, 0]))).toThrow(/version/)
  })

  it('writes decklist text by section, with exact printings and fallbacks', () => {
    const cards = [
      makeCard('riftbound', { name: 'Sett, Brawler', sourceId: 'ven-sp1-006', category: 'Unit' }),
      makeCard('riftbound', { name: 'Vi - Piltover Enforcer (Signature)', sourceId: 'unl-229*-219', category: 'Legend' }),
    ]
    const code = base32([0x15, 1, 1, 3, 1, 2, 5, 0, 2, 1, 1, 1, 1, 1, 1, 1, 4, 2, 0, 229, 1, 0])
    expect(deckCodeToText(code, cards)).toBe(['MainDeck:', '3 ven-sp1-006 Sett, Brawler', '', 'Runes:', '3 Fury Rune', '', 'Sideboard:', '1 unl-229*-219 Vi - Piltover Enforcer (Signature)'].join('\n'))
  })

  it('writes a code back exactly as RiftAtlas wrote it', () => {
    const deck = decodeDeckCode(KENNEN)
    expect(deck.champion).toBe('VEN-135')
    expect(encodeDeckCode(deck.main, deck.sideboard, deck.champion)).toBe(KENNEN)
    const v5 = base32([0x15, 1, 1, 3, 1, 2, 5, 0, 1, 1, 2, 1, 1, 1, 1, 1, 4, 2, 0, 229, 1, 0])
    const read = decodeDeckCode(v5)
    expect(encodeDeckCode(read.main, read.sideboard)).toBe(v5)
  })

  it('names cards by their code', () => {
    const code = (sourceId: string) => cardCode(makeCard('riftbound', { name: 'x', sourceId }))
    expect(code('ogn-066-298')).toBe('OGN-066')
    expect(code('ogn-066a-298')).toBe('OGN-066a')
    expect(code('unl-229*-219')).toBe('UNL-229s')
    expect(code('ven-r01')).toBe('VEN-R01')
    expect(code('ven-sp1-006')).toBe('VEN-SP1')
    expect(code('pr-246a-298')).toBeNull()
  })

  it('writes a deck as a code, with printings it can name and runes by domain', () => {
    const legend = makeCard('riftbound', { name: 'Teemo - Swift Scout', sourceId: 'ogn-263-298', category: 'Legend' })
    const regular = makeCard('riftbound', { name: 'Viktor - Leader', sourceId: 'ogn-246-298', subtypes: ['Champion'] })
    const promo = makeCard('riftbound', { name: 'Viktor - Leader', sourceId: 'pr-246a-298', subtypes: ['Champion'] })
    const cardsById = new Map([legend, regular, promo].map((c) => [c.id, c]))
    const code = deckToCode(
      { zones: { legend: [{ cardId: legend.id, quantity: 1 }], main: [{ cardId: promo.id, quantity: 3 }] }, freeTextZones: { runes: [{ label: 'Mind', quantity: 12 }] } },
      cardsById,
    )
    expect(decodeDeckCode(code)).toEqual({
      main: [
        { code: 'OGN-089', count: 12 },
        { code: 'OGN-246', count: 3 },
        { code: 'OGN-263', count: 1 },
      ],
      sideboard: [],
      extraLegends: [],
      champion: 'OGN-246',
    })
    const lone = makeCard('riftbound', { name: 'Arena Promo', sourceId: 'pr-001-298' })
    expect(() => deckToCode({ zones: { main: [{ cardId: lone.id, quantity: 1 }] }, freeTextZones: {} }, new Map([[lone.id, lone]]))).toThrow(/Arena Promo/)
  })
})
