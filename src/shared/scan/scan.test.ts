import { describe, expect, it } from 'vitest'
import { makeCard } from '../testFixtures'
import type { Card, GameId } from '../types'
import type { OcrLine } from './evidence'
import { extractEvidence } from './evidence'
import { firstPassIsEnough, identify, partSimilarity, textTies } from './match'
import { firstPass } from './priority'
import { buildScanIndex, nameParts, printedName, printedNumber, variantName } from './scanIndex'
import { digitsFromOcr, levenshtein, squash, substringDistance } from './text'

/** OCR lines, top to bottom; `big` marks the large print a name is in. */
function lines(...texts: (string | { text: string; big?: boolean; y?: number })[]): OcrLine[] {
  return texts.map((t, i) => {
    const o = typeof t === 'string' ? { text: t } : t
    const y = o.y ?? 0.05 + i * 0.06
    const h = o.big ? 0.04 : 0.015
    return { text: o.text, conf: 0.95, box: { x: 0.1, y, w: 0.6, h }, textHeight: h }
  })
}

function best(gameId: GameId, cards: Card[], ocr: OcrLine[]) {
  const result = identify(ocr, buildScanIndex(gameId, cards))
  return { result, card: result.candidates[0]?.card }
}

describe('text helpers', () => {
  it('compares names the way OCR mangles them', () => {
    expect(squash("Tasha's Hideous  Laughter")).toBe('tashashideouslaughter')
    expect(squash('Pokémon')).toBe('pokemon')
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('abc', 'xyzxyz', 1)).toBeGreaterThan(1)
    expect(substringDistance('salamence', 'stage2salamencehp160')).toBe(0)
    expect(digitsFromOcr('O86')).toBe('086')
    expect(partSimilarity('vi', 'legendvi', ['legend', 'vi'])).toBeGreaterThan(0.9)
    expect(partSimilarity('mew', 'mewtwo', ['mewtwo'])).toBe(0)
  })
})

describe('printed names and numbers', () => {
  it('drops the labels card data adds', () => {
    expect(printedName(makeCard('onepiece', { name: 'Perona (093)' }))).toBe('Perona')
    expect(printedName(makeCard('onepiece', { name: 'Scratchmen Apoo (Offline Regional 2024) [Finalist]' }))).toBe('Scratchmen Apoo')
    expect(printedName(makeCard('onepiece', { name: 'Carrot - P-070 (Pirate Foil)' }))).toBe('Carrot')
    expect(printedName(makeCard('riftbound', { name: 'Poppy - Paragon (Alternate Art)' }))).toBe('Poppy - Paragon')
    expect(printedName(makeCard('mtg', { name: 'Fire // Ice' }))).toBe('Fire // Ice')
  })

  it('splits names printed on two lines', () => {
    const vi = makeCard('riftbound', { name: 'Vi - Piltover Enforcer' })
    expect(nameParts(vi, printedName(vi))).toEqual(['vi', 'piltoverenforcer'])
    const kennen = makeCard('riftbound', { name: 'Kennen, Storm of Shuriken' })
    expect(nameParts(kennen, printedName(kennen))).toEqual(['kennen', 'stormofshuriken'])
    const dfc = makeCard('mtg', { name: 'Delver of Secrets // Insectile Aberration' })
    expect(nameParts(dfc, printedName(dfc))).toEqual(['delverofsecrets'])
  })

  it('shows the printed number and variant', () => {
    expect(printedNumber(makeCard('riftbound', { name: 'X', sourceId: 'unl-229*-219', number: '229' }))).toBe('229*')
    expect(printedNumber(makeCard('riftbound', { name: 'X', sourceId: 'ogn-089a-298', number: '89' }))).toBe('89a')
    expect(variantName(makeCard('onepiece', { name: 'Edward.Newgate (OP02-004) (Alternate Art)' }))).toBe('Alternate Art')
    expect(variantName(makeCard('riftbound', { name: 'Poppy - Paragon' }))).toBeNull()
  })
})

describe('Riftbound', () => {
  const atlas = makeCard('riftbound', { name: 'World Atlas', sourceId: 'sfd-086-221', setCode: 'SFD', number: '86' })
  const atlasPromo = makeCard('riftbound', { name: 'World Atlas', sourceId: 'opp-086-221', setCode: 'OPP', number: '86', rarity: 'Promo' })
  const other = makeCard('riftbound', { name: 'Filler', sourceId: 'sfd-001-221', setCode: 'SFD', number: '1' })
  const diana = makeCard('riftbound', { name: 'Diana - Scorn of the Moon (Overnumbered)', sourceId: 'unl-234-219', setCode: 'UNL', number: '234' })
  const dianaSig = makeCard('riftbound', { name: 'Diana - Scorn of the Moon (Signature)', sourceId: 'unl-234*-219', setCode: 'UNL', number: '234' })
  const unl = makeCard('riftbound', { name: 'Filler 2', sourceId: 'unl-001-219', setCode: 'UNL', number: '1' })
  const cards = [atlas, atlasPromo, other, diana, dianaSig, unl]

  it('reads "SFD · 086/221" and prefers the set it names', () => {
    const { card, result } = best('riftbound', cards, lines({ text: 'World Atlas', big: true }, 'SFD · 086/221'))
    expect(card?.id).toBe(atlas.id)
    // The promo carries the same printed code, so it stays in the running for the picture to decide.
    expect(textTies(result).map((c) => c.card.id)).toContain(atlasPromo.id)
  })

  it('tells a signature ("234*") from the plain printing', () => {
    expect(best('riftbound', cards, lines('LEGEND', { text: 'DIANA', big: true }, { text: 'Scorn of the Moon', big: true }, 'UNL · 234*/219')).card?.id).toBe(dianaSig.id)
    expect(best('riftbound', cards, lines('LEGEND', { text: 'DIANA', big: true }, { text: 'Scorn of the Moon', big: true }, 'UNL · 234/219')).card?.id).toBe(diana.id)
  })
})

describe('One Piece', () => {
  const perona = makeCard('onepiece', { name: 'Perona (093)', sourceId: 'OP06-093', setCode: 'OP-06', number: '093', category: 'Character' })
  const peronaOld = makeCard('onepiece', { name: 'Perona', sourceId: 'OP01-077', setCode: 'OP-01', number: '077', category: 'Character' })
  const croc = makeCard('onepiece', { name: 'Crocodile (058)', sourceId: 'OP04-058', setCode: 'OP-04', number: '058', category: 'Leader' })
  const crocChar = makeCard('onepiece', { name: 'Crocodile (067)', sourceId: 'OP01-067', setCode: 'OP-01', number: '067', category: 'Character' })
  const promo = makeCard('onepiece', { name: 'Carrot - P-070 (Pirate Foil)', sourceId: 'P-070', setCode: 'PRB-02', number: '070', category: 'Character' })
  const cards = [perona, peronaOld, croc, crocChar, promo]

  it('reads card codes through common misreads', () => {
    for (const code of ['OP06-093', '0P06-093E3', 'OP06-O93', 'SP OP06-093 SE']) {
      expect(best('onepiece', cards, lines('CHARACTER', { text: 'Perona', big: true, y: 0.8 }, { text: code, y: 0.9 })).card?.id, code).toBe(perona.id)
    }
  })

  it('reads promo codes', () => {
    expect(best('onepiece', cards, lines({ text: 'Carrot', big: true, y: 0.8 }, { text: 'P-070', y: 0.9 })).card?.id).toBe(promo.id)
  })

  it('uses the printed card type when the code is unreadable', () => {
    expect(best('onepiece', cards, lines('LEADER', { text: 'Crocodile', big: true, y: 0.8 })).card?.id).toBe(croc.id)
  })
})

describe('Pokémon', () => {
  const slg = makeCard('pokemon', { name: 'Venusaur', sourceId: 'sm35-3', setCode: 'SLG', number: '3' })
  const pgo = makeCard('pokemon', { name: 'Venusaur', sourceId: 'pgo-3', setCode: 'PGO', number: '3' })
  const filler = (set: string, n: number) => Array.from({ length: n }, (_, i) => makeCard('pokemon', { name: `Filler ${set} ${i}`, setCode: set, number: String(100 + i) }))
  const promo = makeCard('pokemon', { name: 'Centiskorch', sourceId: 'swshp-SWSH048', setCode: 'PR-SW', number: 'SWSH048', rarity: 'Promo' })
  const regular = makeCard('pokemon', { name: 'Centiskorch', sourceId: 'swsh3-39', setCode: 'DAA', number: '39' })
  const cards = [slg, pgo, promo, regular, ...filler('SLG', 76), ...filler('PGO', 86)]

  it('tells sets apart by the printed total ("3/73")', () => {
    expect(best('pokemon', cards, lines({ text: 'Venusaur', big: true }, '3/73')).card?.id).toBe(slg.id)
    expect(best('pokemon', cards, lines({ text: 'Venusaur', big: true }, '003/078')).card?.id).toBe(pgo.id)
  })

  it('reads black star promo numbers', () => {
    expect(best('pokemon', cards, lines({ text: 'Centiskorch', big: true }, 'SWSH048')).card?.id).toBe(promo.id)
  })

  it('finds a name printed over two lines', () => {
    const alolan = makeCard('pokemon', { name: 'Alolan Sandslash' })
    const plain = makeCard('pokemon', { name: 'Sandslash' })
    expect(best('pokemon', [alolan, plain], lines({ text: 'Alolan' }, { text: 'Sandslash', big: true })).card?.id).toBe(alolan.id)
  })
})

describe('Yu-Gi-Oh!', () => {
  const lob = makeCard('yugioh', { name: 'Blue-Eyes White Dragon', sourceId: '89631139', setCode: 'LOB', number: 'EN001', rarity: 'Ultra Rare', category: 'Monster' })
  const sdk = makeCard('yugioh', { name: 'Blue-Eyes White Dragon', sourceId: '89631139', setCode: 'SDK', number: 'E001', rarity: 'Ultra Rare', category: 'Monster' })
  const ct13 = makeCard('yugioh', { name: 'Blue-Eyes White Dragon', sourceId: '89631139', setCode: 'CT13', number: 'EN008', rarity: 'Ultra Rare', category: 'Monster' })
  const support = makeCard('yugioh', { name: 'Blue-Eyes Alternative White Dragon', sourceId: '38517737', setCode: 'MVP1', number: 'EN055', category: 'Monster' })
  const cards = [lob, sdk, ct13, support]

  it('reads the set code under the artwork', () => {
    for (const [code, want] of [
      ['LOB-EN001', lob],
      ['SDK-E001', sdk],
      ['CT13-ENOO8', ct13],
    ] as const) {
      expect(best('yugioh', cards, lines({ text: 'Blue-Eyes White Dragon', big: true }, code)).card?.id, code).toBe(want.id)
    }
  })

  it('finds the card from its passcode even with the name misread', () => {
    const { card } = best('yugioh', cards, lines({ text: 'Blue-Eyes Whte Drgn', big: true }, '89631139'))
    expect(card?.sourceId).toBe('89631139')
  })

  it('keeps a name mentioned in rules text from winning', () => {
    const { card } = best('yugioh', cards, lines({ text: 'Blue-Eyes Alternative White Dragon', big: true }, { text: 'You can reveal 1 "Blue-Eyes White Dragon" in your hand', y: 0.7 }))
    expect(card?.id).toBe(support.id)
  })
})

describe('Magic', () => {
  const regular = makeCard('mtg', { name: 'Cavalier of Thorns', setCode: 'M20', number: '167', rarity: 'Mythic' })
  const promo = makeCard('mtg', { name: 'Cavalier of Thorns', setCode: 'PM20', number: '167p', rarity: 'Mythic' })
  const sculler = makeCard('mtg', { name: 'Tidehollow Sculler', setCode: 'MD1', number: '2', rarity: 'Uncommon' })
  const scullerTsr = makeCard('mtg', { name: 'Tidehollow Sculler', setCode: 'TSR', number: '388', rarity: 'Special' })
  const foe = makeCard('mtg', { name: 'Foe-Razer Regent', setCode: 'DTK', number: '187', rarity: 'Rare' })
  const foePromo = makeCard('mtg', { name: 'Foe-Razer Regent', setCode: 'PTKDF', number: '187', rarity: 'Rare' })
  const cards = [regular, promo, sculler, scullerTsr, foe, foePromo]

  it('keeps promo-pack printings in the running with the regular one', () => {
    const { card, result } = best('mtg', cards, lines({ text: 'Cavalier of Thorns', big: true }, { text: '167/280 M', y: 0.9 }, { text: 'M20 • EN', y: 0.93 }))
    expect(card?.id).toBe(regular.id)
    expect(textTies(result).map((c) => c.card.id)).toContain(promo.id)
    expect(result.status).not.toBe('exact')
  })

  it("doesn't read power/toughness as a collector number", () => {
    const { result } = best('mtg', cards, lines({ text: 'Tidehollow Sculler', big: true }, { text: '2/2', y: 0.88 }))
    expect(result.evidence.numbers).not.toContain('2')
  })

  it('reads a promo rarity letter', () => {
    const { result } = best('mtg', cards, lines({ text: 'Foe-Razer Regent', big: true }, { text: '187/264 P', y: 0.9 }))
    expect(result.evidence.rarityLetters).toContain('P')
  })
})

describe('evidence', () => {
  it('only keeps codes that exist in the catalog', () => {
    const card = makeCard('onepiece', { name: 'Nami', sourceId: 'OP01-016', setCode: 'OP-01', number: '016' })
    const index = buildScanIndex('onepiece', [card])
    const ev = extractEvidence('onepiece', lines('OP09-999', 'OP01-016'), index)
    expect(ev.codes.map((c) => c.key)).toEqual(['code:op01-016'])
  })
})

describe('first-pass reading', () => {
  it('reads names, codes and card types before rules text', () => {
    const shape = (cy: number, textHeight: number, width: number) => ({ cy, textHeight, width })
    const lines = [
      shape(0.06, 0.04, 0.6), // 0: name, big print at the top
      shape(0.93, 0.012, 0.25), // 1: collector code, short line at the bottom
      shape(0.95, 0.011, 0.7), // 2: copyright line, long, at the bottom
      shape(0.12, 0.014, 0.3), // 3: type line
      ...Array.from({ length: 12 }, (_, i) => shape(0.5 + i * 0.02, 0.014, 0.85)), // 4..15: rules text
    ]
    expect(new Set(firstPass(lines, 3))).toEqual(new Set([0, 1, 3]))
    // Spare slots go to the copyright line, never to rules text.
    expect(firstPass(lines, 6).some((i) => i >= 4)).toBe(false)
  })

  it('reads everything when there are only a few lines', () => {
    expect(firstPass([{ cy: 0.5, textHeight: 0.02, width: 0.9 }])).toEqual([0])
  })

  it('stops after the first pass only when the name is clear', () => {
    const card = makeCard('mtg', { name: 'Lightning Bolt', setCode: 'M10', number: '146' })
    const index = buildScanIndex('mtg', [card, makeCard('mtg', { name: 'Lightning Bolt', setCode: 'LEA', number: '161' })])
    expect(firstPassIsEnough(identify(lines({ text: 'Lightning Bolt', big: true }), index))).toBe(true)
    expect(firstPassIsEnough(identify(lines({ text: 'Lightnlng Bo', big: true }), index))).toBe(false)
  })
})

