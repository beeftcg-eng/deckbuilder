import { describe, expect, it } from 'vitest'
import { extraOnePieceCards, listingToCard, onepieceSetId, readOnePieceExtras, type OnePieceListing } from './onepieceExtras'
import { makeCard } from '../testFixtures'

const listing = (over: Partial<OnePieceListing>): OnePieceListing => ({
  productId: 712888,
  name: 'Franky',
  number: 'OP18-021',
  rarity: 'L',
  cardType: 'Leader',
  color: 'Green;Purple',
  cost: null,
  power: '5000',
  counter: null,
  life: '4',
  attribute: 'Strike',
  subtypes: 'Straw Hat Crew;Water Seven',
  description: 'All Stage cards in your hand have a +3000 Counter.\r\n<br>[Activate: Main] <strong>Once</strong> &amp; done.',
  set: 'OP18',
  setName: 'The Dominance of God',
  released: '2026-11-20',
  price: 1.25,
  ...over,
})

describe('One Piece cards from TCGplayer listings', () => {
  it('becomes a card shaped like optcgapi’s, with the id the regular printing will have', () => {
    const card = listingToCard(listing({}))
    expect(card).toMatchObject({
      id: 'onepiece:OP18-021',
      sourceId: 'OP18-021',
      name: 'Franky',
      setId: 'OP-18',
      number: '021',
      category: 'Leader',
      colors: ['Green', 'Purple'],
      subtypes: ['Straw Hat Crew Water Seven'],
      price: 1.25,
      setReleased: '2026-11-20',
      imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/712888_in_1000x1000.jpg',
    })
    expect(card.text).toBe('Power: 5000\nLife: 4\nAttribute: Strike\nAll Stage cards in your hand have a +3000 Counter.\n[Activate: Main] Once & done.')
  })

  it('adds only the numbers the card data lacks, from the plainest listing, and no sealed product', () => {
    const known = makeCard('onepiece', { name: 'Nami', sourceId: 'OP17-055' })
    const extras = extraOnePieceCards(
      [
        listing({ productId: 2, name: 'Saint Shamrock (Alternate Art)', number: 'OP18-119', cardType: 'Character' }),
        listing({ productId: 1, name: 'Saint Shamrock', number: 'OP18-119', cardType: 'Character' }),
        listing({ productId: 3, name: 'Nami (Reprint)', number: 'OP17-055', cardType: 'Character' }),
        listing({ productId: 4, name: 'Booster Box', number: '', cardType: null }),
      ],
      [known],
    )
    expect(extras.map((c) => [c.id, c.name, c.imageUrl])).toEqual([['onepiece:OP18-119', 'Saint Shamrock', 'https://tcgplayer-cdn.tcgplayer.com/product/1_in_1000x1000.jpg']])
  })

  it('reads set ids and the published file', () => {
    expect(onepieceSetId('OP18')).toBe('OP-18')
    expect(onepieceSetId('ST-31')).toBe('ST-31')
    expect(readOnePieceExtras({ listings: [listing({}), { name: 'x' }] })).toHaveLength(1)
    expect(readOnePieceExtras(null)).toEqual([])
  })
})
