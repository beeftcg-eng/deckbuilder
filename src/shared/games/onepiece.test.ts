import { describe, expect, it } from 'vitest'
import { DON_SET_ID, normalizeDon, onepieceAdapter } from './onepiece'
import { riftboundAdapter } from './riftbound'
import { makeCard } from '../testFixtures'

const raw = {
  card_name: 'DON!! Card (Gol.D.Roger) (Gold)',
  card_text: 'Your Turn +1000',
  card_image_id: 'don_10',
  card_image: 'https://www.optcgapi.com/media/static/Card_Images/don_10.jpg',
  market_price: 4.3,
  optcg_don_name: 'DON!! Card (Gol.D.Roger) (Gold) - Carrying On His Will (OP13)',
}

describe('One Piece DON!! cards', () => {
  it('go in their own set, numbered by the product they came in', () => {
    const card = normalizeDon(raw)
    expect(card).toMatchObject({
      id: 'onepiece:don_10',
      name: 'DON!! Card (Gol.D.Roger) (Gold)',
      setId: DON_SET_ID,
      number: 'OP13',
      category: 'DON!!',
      price: 4.3,
      text: 'Your Turn +1000\nFrom: Carrying On His Will (OP13)',
    })
  })

  it('cope with a product that has no code, or no product at all', () => {
    expect(normalizeDon({ ...raw, optcg_don_name: 'DON!! Card (Gol.D.Roger) (Gold) - The Time of Battle' })).toMatchObject({
      number: '',
      text: 'Your Turn +1000\nFrom: The Time of Battle',
    })
    expect(normalizeDon({ ...raw, optcg_don_name: null, market_price: 0 })).toMatchObject({ number: '', text: 'Your Turn +1000', price: null })
  })
})

describe('cards that never go in a deck', () => {
  const zonesFor = (adapter: typeof onepieceAdapter, card: ReturnType<typeof makeCard>) =>
    adapter.deckRules.zones.filter((z) => !z.freeText && z.match(card)).map((z) => z.id)

  it('keep DON!! cards out of the One Piece main deck', () => {
    expect(zonesFor(onepieceAdapter, normalizeDon(raw))).toEqual([])
    expect(zonesFor(onepieceAdapter, makeCard('onepiece', { name: 'Nami', category: 'Character' }))).toEqual(['main'])
  })

  it('keep rune cards out of the Riftbound main deck and sideboard', () => {
    expect(zonesFor(riftboundAdapter, makeCard('riftbound', { category: 'Rune', name: 'Fury Rune (Alternate Art)' }))).toEqual([])
    expect(zonesFor(riftboundAdapter, makeCard('riftbound', { name: 'Bewitching Spirit', category: 'Unit' }))).toEqual(['main', 'sideboard'])
  })
})
