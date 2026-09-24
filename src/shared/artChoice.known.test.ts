import { describe, expect, it, vi } from 'vitest'
import { makeCard } from './testFixtures'

// A small stand-in for the generated map: Dark Magician GFTP-EN128 Ghost Rare only ever had the
// default art; RA04-EN106 QCSR came in two; Monster Reborn 26LP-EN001 only the alternate one.
vi.mock('./games/yugiohArtMap', () => ({
  YGO_ART_MAP: {
    'GFTP-EN128|Ghost Rare': [46986414],
    'RA04-EN106|Quarter Century Secret Rare': [46986415, 46986419],
    '26LP-EN001|Secret Rare': [83764718],
  },
  YGO_ART_MAP_DATE: 'test',
}))

const { applyArtChoices, artworkIds, knownArtIds, withArtwork } = await import('./artChoice')

const dm = (setCode: string, number: string, rarity: string) =>
  makeCard('yugioh', {
    name: 'Dark Magician', sourceId: '46986414', setCode, number, rarity,
    imageUrl: 'dbimg://ygo/full/46986414.jpg', imageUrlSmall: 'dbimg://ygo/small/46986414.jpg',
    altImageUrlsSmall: ['46986415', '46986416', '46986419', '46986421'].map((id) => `dbimg://ygo/small/${id}.jpg`),
  })

describe('artworks a printing was actually printed with', () => {
  it('offers only the known artworks for a mapped printing', () => {
    expect(artworkIds(dm('GFTP', 'EN128', 'Ghost Rare'))).toEqual(['46986414'])
    expect(artworkIds(dm('RA04', 'EN106', 'Quarter Century Secret Rare'))).toEqual(['46986415', '46986419'])
  })

  it('offers every artwork when the printing is unknown', () => {
    expect(knownArtIds(dm('LOB', 'EN005', 'Ultra Rare'))).toBeNull()
    expect(artworkIds(dm('LOB', 'EN005', 'Ultra Rare'))).toHaveLength(5)
  })

  it('shows a printing its own art automatically when the card data shows another', () => {
    const reborn = makeCard('yugioh', {
      name: 'Monster Reborn', sourceId: '83764718', setCode: '26LP', number: 'EN001', rarity: 'Secret Rare',
      imageUrl: 'dbimg://ygo/full/83764718.jpg', imageUrlSmall: 'dbimg://ygo/small/83764718.jpg',
      altImageUrlsSmall: ['dbimg://ygo/small/83764719.jpg'],
    })
    // The card data's first artwork happens to be 83764718 here; flip it to prove the swap.
    const listedOtherWay = { ...reborn, imageUrl: 'dbimg://ygo/full/83764719.jpg', imageUrlSmall: 'dbimg://ygo/small/83764719.jpg', altImageUrlsSmall: ['dbimg://ygo/small/83764718.jpg'] }
    const [fixed] = applyArtChoices([listedOtherWay], undefined)
    expect(fixed.imageUrl).toBe('dbimg://ygo/full/83764718.jpg')
    expect(artworkIds(fixed)).toEqual(['83764718'])
  })

  it('lets you choose only between the printing\'s own artworks, and ignores a choice it never had', () => {
    const qcsr = applyArtChoices([dm('RA04', 'EN106', 'Quarter Century Secret Rare')], undefined)[0]
    expect(qcsr.imageUrl).toBe('dbimg://ygo/full/46986415.jpg')
    expect(withArtwork(qcsr, '46986419').imageUrl).toBe('dbimg://ygo/full/46986419.jpg')
    expect(withArtwork(qcsr, '46986421').imageUrl).toBe('dbimg://ygo/full/46986415.jpg')
  })
})
