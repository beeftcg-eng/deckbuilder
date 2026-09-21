import { describe, expect, it } from 'vitest'
import { IMAGE_PADDING, MAX_IMAGE_BYTES, THUMB_GAP, THUMB_WIDTH, columnsFor, dataUrlBytes, imageExtension, imageWidthFor } from './exportImage'

describe('columnsFor', () => {
  it('puts more cards in a row as the deck grows, within limits', () => {
    expect(columnsFor(0)).toBe(4)
    expect(columnsFor(1)).toBe(4)
    expect(columnsFor(12)).toBeLessThan(columnsFor(40))
    expect(columnsFor(1000)).toBe(10)
  })

  it('keeps a typical deck about as wide as it is tall, so it reads at a glance', () => {
    for (const cards of [20, 30, 40, 60]) {
      const columns = columnsFor(cards)
      const rows = Math.ceil(cards / columns)
      const width = columns * (THUMB_WIDTH + THUMB_GAP)
      const height = rows * (THUMB_WIDTH * 1.4 + THUMB_GAP)
      expect(width / height, `${cards} cards`).toBeGreaterThan(0.8)
      expect(width / height, `${cards} cards`).toBeLessThan(2)
    }
  })
})

describe('imageWidthFor', () => {
  it('adds the gaps and both margins', () => {
    expect(imageWidthFor(1)).toBe(THUMB_WIDTH + 2 * IMAGE_PADDING)
    expect(imageWidthFor(5)).toBe(5 * THUMB_WIDTH + 4 * THUMB_GAP + 2 * IMAGE_PADDING)
  })
})

describe('dataUrlBytes', () => {
  it('measures the decoded payload, with or without padding', () => {
    expect(dataUrlBytes('data:image/jpeg;base64,' + Buffer.from('abc').toString('base64'))).toBe(3)
    expect(dataUrlBytes('data:image/jpeg;base64,' + Buffer.from('abcd').toString('base64'))).toBe(4)
    expect(dataUrlBytes('data:image/jpeg;base64,' + Buffer.from('abcde').toString('base64'))).toBe(5)
    expect(dataUrlBytes('data:image/png;base64,')).toBe(0)
  })
})

describe('imageExtension', () => {
  it('follows the picture type', () => {
    expect(imageExtension('data:image/png;base64,AAAA')).toBe('png')
    expect(imageExtension('data:image/jpeg;base64,AAAA')).toBe('jpg')
  })
})

it('the size cap leaves headroom under WhatsApp’s 16 MB', () => {
  expect(MAX_IMAGE_BYTES).toBeLessThan(16 * 1024 * 1024)
})
