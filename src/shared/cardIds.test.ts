import { describe, expect, it } from 'vitest'
import { uniquifyCardIds } from './cardIds'
import { catalogOf, makeCard } from './testFixtures'

const op = (id: string, name: string, file: string, setId = 'OP-01') =>
  makeCard('onepiece', { name, id: `onepiece:${id}`, sourceId: id.split('_')[0], setId, imageUrl: `https://www.optcgapi.com/media/static/Card_Images/${file}` })

// Magic's Unique Artwork data gives every printing (regular or alternate-art) a plain Scryfall-UUID image and no
// parenthetical name qualifier, so none of One Piece's signals above tell them apart — only rarity/isAlternateArt do.
const mtg = (oracleId: string, printingId: string, rarity: string, setId = 'set') =>
  makeCard('mtg', { name: 'Cyclonic Rift', id: `mtg:${oracleId}`, sourceId: oracleId, rarity, setId, imageUrl: `https://cards.scryfall.io/normal/front/${printingId}.jpg` })

// YGOPRODeck's card_sets printings of one card all reuse the SAME card_images entry (no per-printing art), so
// unlike Magic, every duplicate here ties on the image signal too — only rarity actually tells them apart.
const ygo = (passcode: string, setId: string, rarity: string) =>
  makeCard('yugioh', { name: 'Dark Magician', id: `yugioh:${passcode}`, sourceId: passcode, rarity, setId, imageUrl: `dbimg://ygo/full/${passcode}.jpg` })

describe('uniquifyCardIds', () => {
  it('returns the very same array when every id is already unique', () => {
    const cards = [op('OP01-006', 'Otama', 'OP01-006.jpg'), op('OP01-007', 'Other', 'OP01-007.jpg')]
    expect(uniquifyCardIds(cards)).toBe(cards)
  })

  it('gives look-alike printings their own ids and lets the regular one keep the original id, whatever order they arrive in', () => {
    const alt = op('OP01-006', 'Otama (Alternate Art)', 'OP01-006_p5.jpg', 'PRB-01')
    const foil = op('OP01-006', 'Otama (Jolly Roger Foil)', 'OP01-006_p3.jpg', 'PRB-01')
    const regular = op('OP01-006', 'Otama', 'OP01-006.jpg')
    const fixed = uniquifyCardIds([alt, foil, regular])
    expect(fixed.map((c) => c.id)).toEqual(['onepiece:OP01-006_p5', 'onepiece:OP01-006_p3', 'onepiece:OP01-006'])
    expect(new Set(fixed.map((c) => c.id)).size).toBe(3)
    // the regular printing is what the original id now means, so anything saved against it gets the regular card
    expect(catalogOf(fixed).get('onepiece:OP01-006')?.name).toBe('Otama')
  })

  it('keeps the first when none of the duplicates has the plain image, and does not touch other fields', () => {
    const a = op('OP03-070', 'A', 'OP03-070_p1.jpg')
    const b = op('OP03-070', 'B', 'OP03-070_p2.jpg')
    const [first, second] = uniquifyCardIds([a, b])
    expect(first.id).toBe('onepiece:OP03-070')
    expect(second.id).toBe('onepiece:OP03-070_p2')
    expect(second).toEqual({ ...b, id: 'onepiece:OP03-070_p2' })
    expect(second.sourceId).toBe('OP03-070') // still the shared official number: copy limits are pooled by it
  })

  it('recognises the regular printing even when its image has a random suffix (the real OP-03 / ST-10 shapes)', () => {
    const kalifaAlt = op('OP03-081', 'Kalifa (081) (Alternate Art)', 'OP03-081_p1.jpg')
    const kalifaDash = op('OP03-081', 'Kalifa (Dash Pack)', 'OP03-081_p1_cCn0Rtb.jpg', 'OP-04')
    const kalifa = op('OP03-081', 'Kalifa (081)', 'OP03-081_vUclrLA.jpg')
    const fixed = uniquifyCardIds([kalifaAlt, kalifaDash, kalifa])
    expect(catalogOf(fixed).get('onepiece:OP03-081')?.name).toBe('Kalifa (081)')
    const treasure = op('ST10-010', 'Trafalgar Law (010) (TR)', 'ST10-010_p2.jpg', 'OP-07')
    const reprint = op('ST10-010', 'Trafalgar Law (ST10-010) (Reprint)', 'ST10-010_p7.jpg', 'PRB-01')
    const regular = op('ST10-010', 'Trafalgar Law (010)', 'ST10-010_7CxTZxR.jpg', 'ST-10')
    expect(catalogOf(uniquifyCardIds([treasure, reprint, regular])).get('onepiece:ST10-010')?.name).toBe('Trafalgar Law (010)')
  })

  it('when everything else ties, the first listed keeps the id (the earliest set)', () => {
    const base = op('OP03-006', 'Speed Jil', 'OP03-006_tqFRtL6.jpg', 'OP-03')
    const starter = op('OP03-006', 'Speed Jil', 'OP03-006_3yphD6n.jpg', 'ST-15')
    expect(catalogOf(uniquifyCardIds([base, starter])).get('onepiece:OP03-006')?.setId).toBe('OP-03')
  })

  it('handles image URLs with query strings, and cards with no image at all', () => {
    const regular = op('OP02-018', 'Marco', 'OP02-018.jpg')
    const starter = { ...op('OP02-018', 'Marco', 'OP02-018_3caX29L.jpg?v=2', 'ST-15') }
    const noImage = { ...op('OP02-018', 'Marco (no art)', 'x.jpg', 'ST-16'), imageUrl: null }
    const fixed = uniquifyCardIds([regular, starter, noImage])
    expect(fixed.map((c) => c.id)).toEqual(['onepiece:OP02-018', 'onepiece:OP02-018_3caX29L', 'onepiece:OP02-018~ST-16'])
  })

  it('never invents an id that is already taken, and is deterministic', () => {
    const a = op('X-1', 'A', 'X-1.jpg')
    const b = op('X-1', 'B', 'X-1_p1.jpg')
    const taken = op('X-1_p1', 'C', 'X-1_p1.jpg')            // an unrelated card that already owns "onepiece:X-1_p1"
    const first = uniquifyCardIds([a, b, taken])
    expect(new Set(first.map((c) => c.id)).size).toBe(3)
    expect(uniquifyCardIds([a, b, taken]).map((c) => c.id)).toEqual(first.map((c) => c.id))
  })

  it('picks the plain printing over a showcase/promo one for Magic, where no image or name signal tells them apart', () => {
    const showcase = mtg('cyclonic-rift', 'aaaa1111', 'showcase', 'special-set')
    const regular = mtg('cyclonic-rift', 'bbbb2222', 'rare', 'ced')
    const fixed = uniquifyCardIds([showcase, regular])
    expect(catalogOf(fixed).get('mtg:cyclonic-rift')?.setId).toBe('ced')
    expect(fixed.map((c) => c.id)).toEqual(['mtg:aaaa1111', 'mtg:cyclonic-rift'])
  })

  it('picks the plain rarity over a secret/ultra one for Yu-Gi-Oh, where every printing shares the same image', () => {
    const secret = ygo('46986414', 'CT14', 'Secret Rare')
    const common = ygo('46986414', 'LOB', 'Common')
    const ultra = ygo('46986414', 'SDY', 'Ultra Rare')
    const fixed = uniquifyCardIds([secret, common, ultra])
    expect(catalogOf(fixed).get('yugioh:46986414')?.rarity).toBe('Common')
    // no per-printing image to derive a fresh id from, so the fallback keys off the id, set and rarity instead
    expect(fixed.map((c) => c.id)).toEqual(['yugioh:46986414~CT14~Secret Rare', 'yugioh:46986414', 'yugioh:46986414~SDY~Ultra Rare'])
  })

  it('gives two Yu-Gi-Oh printings that share a set code but differ only by rarity their own stable ids, not an arbitrary ~2/~3 counter', () => {
    const commonPrint = ygo('12345678', 'ABC1', 'Common')
    const rarePrint = ygo('12345678', 'ABC1', 'Rare')
    const fixed = uniquifyCardIds([commonPrint, rarePrint])
    expect(fixed.map((c) => c.id)).toEqual(['yugioh:12345678', 'yugioh:12345678~ABC1~Rare'])
  })

  it('still produces two distinct, stable ids for two rows with identical set and rarity, though normalizeCard is what actually prevents this case', () => {
    const dup1 = ygo('12345678', 'ABC1', 'Common')
    const dup2 = ygo('12345678', 'ABC1', 'Common')
    const fixed = uniquifyCardIds([dup1, dup2])
    // uniquifyCardIds itself doesn't dedupe (that's normalizeCard's job, tested in yugioh.test.ts) -
    // it still needs to produce two distinct ids for two rows that reach it, without crashing.
    expect(new Set(fixed.map((c) => c.id)).size).toBe(2)
    expect(fixed.every((c) => c.id.startsWith('yugioh:12345678'))).toBe(true)
  })

  it('does not mutate its input', () => {
    const cards = [op('A-1', 'One', 'A-1.jpg'), op('A-1', 'Two', 'A-1_p1.jpg')]
    const before = structuredClone(cards)
    uniquifyCardIds(cards)
    expect(cards).toEqual(before)
  })
})
