import { describe, expect, it } from 'vitest'
import { applyArtChoices, artworkIds, printingKey, withArtwork } from './artChoice'
import { makeCard } from './testFixtures'

const bewd = () => makeCard('yugioh', {
  name: 'Blue-Eyes White Dragon', sourceId: '89631139', setCode: 'LOB', number: 'EN001', rarity: 'Ultra Rare',
  imageUrl: 'dbimg://ygo/full/89631139.jpg', imageUrlSmall: 'dbimg://ygo/small/89631139.jpg',
  altImageUrlsSmall: ['dbimg://ygo/small/89631140.jpg', 'dbimg://ygo/small/89631141.jpg'],
})

describe('artwork choice', () => {
  it('lists every artwork, default first', () => {
    expect(artworkIds(bewd())).toEqual(['89631139', '89631140', '89631141'])
  })
  it('swaps the image to the chosen art and back to the default', () => {
    const chosen = withArtwork(bewd(), '89631141')
    expect(chosen.imageUrl).toBe('dbimg://ygo/full/89631141.jpg')
    expect(chosen.imageUrlSmall).toBe('dbimg://ygo/small/89631141.jpg')
    expect(chosen.altImageUrlsSmall).toEqual(['dbimg://ygo/small/89631139.jpg', 'dbimg://ygo/small/89631140.jpg'])
    expect(artworkIds(chosen)[0]).toBe('89631139')
    const back = withArtwork(chosen, null)
    expect(back.imageUrl).toBe('dbimg://ygo/full/89631139.jpg')
    expect(back.altImageUrlsSmall).toEqual(['dbimg://ygo/small/89631140.jpg', 'dbimg://ygo/small/89631141.jpg'])
  })
  it('ignores an unknown artwork and cards with only one', () => {
    expect(withArtwork(bewd(), '123').imageUrl).toBe('dbimg://ygo/full/89631139.jpg')
    const single = makeCard('yugioh', { name: 'X', imageUrl: 'dbimg://ygo/full/1.jpg' })
    expect(withArtwork(single, '1')).toBe(single)
  })
  it('applies saved choices by printing, leaving other printings and games alone', () => {
    const lob = bewd()
    const other = { ...bewd(), id: 'yugioh:89631139~SDK', setCode: 'SDK', number: '001' }
    const rift = makeCard('riftbound', { name: 'Jinx' })
    const cards = [lob, other, rift]
    const out = applyArtChoices(cards, { [printingKey(lob)]: '89631140' })
    expect(out[0].imageUrl).toBe('dbimg://ygo/full/89631140.jpg')
    expect(out[1]).toBe(other)
    expect(out[2]).toBe(rift)
    expect(applyArtChoices(cards, {})).toBe(cards)
  })
})

describe('artwork choice on the phone app (resolved image URLs)', () => {
  it('reads and writes YGOPRODeck URLs when the card already uses them', () => {
    const web = makeCard('yugioh', {
      name: 'Dark Magician', sourceId: '46986414', setCode: 'LOB', number: 'EN005', rarity: 'Ultra Rare',
      imageUrl: 'https://images.ygoprodeck.com/images/cards/46986414.jpg',
      imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/46986414.jpg',
      altImageUrlsSmall: ['https://images.ygoprodeck.com/images/cards_small/46986415.jpg'],
    })
    expect(artworkIds(web)).toEqual(['46986414', '46986415'])
    const chosen = withArtwork(web, '46986415')
    expect(chosen.imageUrl).toBe('https://images.ygoprodeck.com/images/cards/46986415.jpg')
    expect(chosen.altImageUrlsSmall).toEqual(['https://images.ygoprodeck.com/images/cards_small/46986414.jpg'])
  })
})
