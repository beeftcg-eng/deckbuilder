import { describe, expect, it } from 'vitest'
import { extraCards, keepExtrasWhenMissing, missingPrintings, onlyOriginsRegularRunes, withOvernumberedKind, withPromoRuneArt } from './riftboundExtras'
import type { RiftboundExtra } from '../priceKeys'
import { makeCard } from '../testFixtures'

const product = (over: Partial<RiftboundExtra> & Pick<RiftboundExtra, 'productId' | 'name' | 'number'>): RiftboundExtra => ({
  group: 'OPP',
  groupName: 'Riftbound Organized Play Promotional Cards',
  rarity: 'Promo',
  type: 'Unit',
  domains: ['Fury'],
  energy: 4,
  text: null,
  image: false,
  released: '2025-10-31',
  ...over,
})

describe('missingPrintings', () => {
  const kayle = makeCard('riftbound', { name: 'Kayle - Justified', sourceId: 'opp-134-166' }) // no product id yet
  const swain = makeCard('riftbound', { name: 'Swain - Visionary', sourceId: 'opp-065-166', tcgplayerId: '713481' })
  const newSet = makeCard('riftbound', { name: 'Dockside Lock-Up', sourceId: 'rad-136-167' })

  it("keeps the products riftcodex has neither by product id nor by set, number and name", () => {
    const products = [
      product({ productId: 713481, name: 'Swain, Visionary', number: '065/166' }),
      product({ productId: 1, name: 'Kayle, Justified', number: '134/166' }),
      product({ productId: 713479, name: 'Kayle, Justified (Top 8)', number: '134/166' }),
      product({ productId: 2, name: 'Dockside Lock-Up', number: '136/167', group: 'RAD' }),
      product({ productId: 709727, name: 'Blade Twirler', number: '002/166' }),
      product({ productId: 3, name: 'Mech // Recruit', number: 'T03 // T04', type: 'Unit;Token' }),
      product({ productId: 4, name: 'Void Gate (Oversized)', number: '296/298', group: 'OGS' }),
    ]
    expect(missingPrintings(products, [kayle, swain, newSet]).map((p) => p.productId)).toEqual([713479, 709727])
  })
})

describe('extraCards', () => {
  const twirler = makeCard('riftbound', { name: 'Blade Twirler', sourceId: 'ven-002-166', setId: 'VEN', setName: 'Vendetta', category: 'Unit', colors: ['Fury'], cost: '4', text: 'The first time I move…', tcgplayerId: '706005', released: '2026-07-31' })
  const kayle = makeCard('riftbound', { name: 'Kayle - Justified', sourceId: 'ven-134-166', setId: 'VEN', category: 'Unit', subtypes: ['Champion'], colors: ['Order'] })
  const venRune = makeCard('riftbound', { name: 'Fury Rune', sourceId: 'ven-r01', setId: 'VEN', setName: 'Vendetta', category: 'Rune', released: '2026-07-31' })
  const cards = [twirler, kayle, venRune]

  it("makes a Nexus Night promo a printing of its card, with the card's text and type", () => {
    const [card] = extraCards([product({ productId: 709727, name: 'Blade Twirler', number: '002/166', rarity: 'Common', text: '<em>html</em>' })], cards)
    expect(card).toMatchObject({
      id: 'riftbound:tcg-709727', sourceId: 'opp-002-166', name: 'Blade Twirler', setId: 'OPP', setName: 'Riftbound Organized Play Promotional Cards',
      number: '2', category: 'Unit', colors: ['Fury'], cost: '4', text: 'The first time I move…', tcgplayerId: '709727', imageUrl: null,
    })
  })

  it("keeps TCGplayer's qualifiers on riftcodex's name for the card", () => {
    const [card] = extraCards([product({ productId: 713479, name: 'Kayle, Justified (Top 8)', number: '134/166' })], cards)
    expect(card).toMatchObject({ name: 'Kayle - Justified (Top 8)', subtypes: ['Champion'], colors: ['Order'] })
  })

  it('names runes the way riftcodex does, and fixes the Vendetta promo runes', () => {
    const [showcase, promo, vendetta] = extraCards(
      [
        product({ productId: 709310, name: 'Calm Rune (R02a)', number: 'R02a', group: 'VEN', groupName: 'Vendetta', rarity: 'Showcase', type: 'Rune', image: true }),
        product({ productId: 697499, name: 'Fury Rune (R01c)', number: 'R01c', type: 'Rune' }),
        product({ productId: 709748, name: 'Fury Rune (Vendetta)', number: 'R01b', rarity: 'Common', type: 'Rune' }),
      ],
      cards,
    )
    expect(showcase).toMatchObject({ id: 'riftbound:tcg-709310', sourceId: 'ven-r02a', name: 'Calm Rune (Alternate Art)', number: '2a', category: 'Rune', subtypes: ['Basic'], imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/709310_in_1000x1000.jpg' })
    expect(promo).toMatchObject({ sourceId: 'opp-r01c', name: 'Fury Rune', number: '1c', rarity: 'Promo' })
    expect(vendetta).toMatchObject({ sourceId: 'ven-r01b', name: 'Fury Rune', setId: 'VEN', setName: 'Vendetta', rarity: 'Promo', released: '2026-07-31', imageUrl: expect.stringMatching(/card-art\/riftbound\/opp-r01b\.png$/) })
  })

  it('gives Vendetta showcase runes without a TCGplayer picture the published art', () => {
    const [fury] = extraCards(
      [product({ productId: 709312, name: 'Fury Rune (R01a)', number: 'R01a', group: 'VEN', groupName: 'Vendetta', rarity: 'Showcase', type: 'Rune' })],
      [],
    )
    expect(fury).toMatchObject({ sourceId: 'ven-r01a', name: 'Fury Rune (Alternate Art)', rarity: 'Showcase', imageUrl: expect.stringMatching(/card-art\/riftbound\/ven-r01a\.webp$/) })
  })

  it('reads type and text from TCGplayer for a card riftcodex has no printing of', () => {
    const [card] = extraCards([product({ productId: 721346, name: "K'Sante, Courageous (Showcase)", number: '178/167', group: 'RAD', groupName: 'Radiance', rarity: 'Showcase', type: 'Champion Unit', domains: ['Body'], energy: 5, text: '<em>Tank.</em>', released: '2026-10-23' })], cards)
    expect(card).toMatchObject({ name: "K'Sante, Courageous (Showcase)", setName: 'Radiance', category: 'Unit', subtypes: ['Champion'], colors: ['Body'], cost: '5', text: 'Tank.', released: '2026-10-23' })
  })

  it('skips products the card data already has', () => {
    expect(extraCards([product({ productId: 706005, name: 'Blade Twirler', number: '002/166' })], cards)).toEqual([])
  })
})

describe('keepExtrasWhenMissing', () => {
  const extra = makeCard('riftbound', { id: 'riftbound:tcg-709727', name: 'Blade Twirler', tcgplayerId: '709727' })
  const regular = makeCard('riftbound', { name: 'Blade Twirler' })

  it("keeps the previous sync's extra printings when this one has none", () => {
    expect(keepExtrasWhenMissing([regular], [regular, extra]).map((c) => c.id)).toEqual([regular.id, extra.id])
  })

  it('drops one riftcodex now lists, and changes nothing when the price file loaded', () => {
    const listed = makeCard('riftbound', { name: 'Blade Twirler', tcgplayerId: '709727' })
    expect(keepExtrasWhenMissing([regular, listed], [extra])).toEqual([regular, listed])
    const fresh = [regular, extra]
    expect(keepExtrasWhenMissing(fresh, [])).toBe(fresh)
  })
})

describe('withPromoRuneArt', () => {
  it("shows the Organized Play promo rune's own art, not Vendetta's", () => {
    const promo = makeCard('riftbound', { name: 'Calm Rune', sourceId: 'opp-042b-298', category: 'Rune', imageUrl: 'https://x/venr02.png' })
    const other = makeCard('riftbound', { name: 'Jinx', sourceId: 'opp-251-298', imageUrl: 'https://x/jinx.png' })
    const [fixed, untouched] = withPromoRuneArt([promo, other])
    expect(fixed.imageUrl).toMatch(/card-art\/riftbound\/opp-042b\.webp$/)
    expect(fixed.imageUrlSmall).toBe(fixed.imageUrl)
    expect(untouched).toBe(other)
  })
})

describe('onlyOriginsRegularRunes', () => {
  const rune = (over: Parameters<typeof makeCard>[1]) => makeCard('riftbound', { category: 'Rune', rarity: 'Common', ...over })

  it("keeps Origins' regular runes and moves the other sets' onto them", () => {
    const origins = rune({ id: 'riftbound:ogn-calm', name: 'Calm Rune', setId: 'OGN' })
    const vendetta = rune({ id: 'riftbound:ven-calm', name: 'Calm Rune', setId: 'VEN', formerIds: ['riftbound:ven-calm-early'] })
    const unleashed = rune({ id: 'riftbound:tcg-696616', name: 'Calm Rune', setId: 'UNL' })
    const altArt = rune({ id: 'riftbound:tcg-692933', name: 'Calm Rune (Alternate Art)', setId: 'UNL', rarity: 'Showcase' })
    const promo = rune({ id: 'riftbound:tcg-709746', name: 'Calm Rune', setId: 'VEN', rarity: 'Promo' })
    const kept = onlyOriginsRegularRunes([origins, vendetta, unleashed, altArt, promo])
    expect(kept.map((c) => c.id)).toEqual([origins.id, altArt.id, promo.id])
    expect(kept[0].formerIds).toEqual(['riftbound:ven-calm', 'riftbound:ven-calm-early', 'riftbound:tcg-696616'])
  })

  it("keeps another set's regular rune when Origins' is missing", () => {
    const vendetta = rune({ name: 'Fury Rune', setId: 'VEN' })
    expect(onlyOriginsRegularRunes([vendetta])).toEqual([vendetta])
  })
})

describe('withOvernumberedKind', () => {
  it('gives Overnumbered printings their own kind', () => {
    const over = makeCard('riftbound', { name: 'Kayle, Justified (Overnumbered)', rarity: 'Showcase', subtypes: ['Champion'] })
    const alt = makeCard('riftbound', { name: 'Kayle, Justified (Alternate Art)', rarity: 'Showcase', subtypes: ['Champion'] })
    const [tagged, untouched] = withOvernumberedKind([over, alt])
    expect(tagged.subtypes).toEqual(['Champion', 'Overnumbered'])
    expect(untouched).toBe(alt)
  })
})
