import { describe, expect, it } from 'vitest'
import { resolveDbImgUrl } from './dbImgUrl'

describe('resolveDbImgUrl', () => {
  it('resolves a full-size dbimg url to the real YGOPRODeck CDN url', () => {
    expect(resolveDbImgUrl('dbimg://ygo/full/89631139.jpg')).toBe('https://images.ygoprodeck.com/images/cards/89631139.jpg')
  })

  it('resolves a small dbimg url to the small-image CDN url', () => {
    expect(resolveDbImgUrl('dbimg://ygo/small/89631139.jpg')).toBe('https://images.ygoprodeck.com/images/cards_small/89631139.jpg')
  })

  it('passes an ordinary https url through unchanged', () => {
    const url = 'https://cards.scryfall.io/large/front/x.jpg'
    expect(resolveDbImgUrl(url)).toBe(url)
  })

  it('passes a malformed dbimg url through unchanged rather than guessing', () => {
    const bad = 'dbimg://ygo/huge/123.jpg'
    expect(resolveDbImgUrl(bad)).toBe(bad)
  })
})
