import { describe, expect, it } from 'vitest'
import { buildProxyPdf, cardSizeMm, defaultPaper, pageLayout, PAPER_MM, proxyCopies } from './proxies'
import { poolKey } from './collection'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

const bolt = makeCard('mtg', { name: 'Lightning Bolt' })
const boltAlt = makeCard('mtg', { name: 'Lightning Bolt', setCode: 'SLD' })
const island = makeCard('mtg', { name: 'Island' })
const cards = catalogOf([bolt, boltAlt, island])

describe('proxyCopies', () => {
  const deck = makeDeck('mtg', { main: [[bolt, 2], [boltAlt, 2], [island, 10]], sideboard: [[bolt, 1]] })

  it('lists every copy per printing, zones added together', () => {
    expect(proxyCopies(deck, cards).map((c) => [c.card.id, c.copies])).toEqual([
      [bolt.id, 3],
      [boltAlt.id, 2],
      [island.id, 10],
    ])
  })

  it('prints zones in the order given, whatever order the deck stores them in', () => {
    expect(proxyCopies(deck, cards, { zoneOrder: ['sideboard', 'main'] }).map((c) => [c.card.id, c.copies])).toEqual([
      [bolt.id, 3],
      [boltAlt.id, 2],
      [island.id, 10],
    ])
    const legendLast = makeDeck('mtg', { main: [[island, 1]], legend: [[bolt, 1]] })
    expect(proxyCopies(legendLast, cards, { zoneOrder: ['legend', 'main'] }).map((c) => c.card.id)).toEqual([bolt.id, island.id])
  })

  it('leaves out zones that aren’t picked', () => {
    expect(proxyCopies(deck, cards, { zoneIds: new Set(['sideboard']) }).map((c) => [c.card.id, c.copies])).toEqual([[bolt.id, 1]])
  })

  it('prints only what you’re missing, counting any printing you own', () => {
    const owned = new Map([
      [poolKey(bolt), 3],
      [poolKey(island), 10],
    ])
    expect(proxyCopies(deck, cards, { owned }).map((c) => [c.card.id, c.copies])).toEqual([
      [boltAlt.id, 1],
      [bolt.id, 1],
    ])
  })
})

describe('pageLayout', () => {
  it('fits 9 poker-size cards on Letter and A4, centred, inside the printable area', () => {
    for (const paper of ['letter', 'a4'] as const) {
      const layout = pageLayout(paper, 'mtg')
      expect(layout.slots).toHaveLength(9)
      const page = PAPER_MM[paper]
      const right = layout.slots[8].x + layout.card.width
      const bottom = layout.slots[8].y + layout.card.height
      expect(layout.slots[0].x).toBeCloseTo(page.width - right)
      expect(layout.slots[0].y).toBeCloseTo(page.height - bottom)
      expect(layout.slots[0].x).toBeGreaterThanOrEqual(6)
      for (const m of layout.marks) for (const v of [m.x1, m.x2]) expect(v).toBeGreaterThan(0)
    }
  })

  it('uses Yu-Gi-Oh!’s smaller card size', () => {
    expect(cardSizeMm('yugioh')).toEqual({ width: 59, height: 86 })
    expect(pageLayout('a4', 'yugioh').card.width).toBe(59)
  })

  it('picks Letter for the Americas and A4 elsewhere', () => {
    expect(defaultPaper('en-US')).toBe('letter')
    expect(defaultPaper('es-MX')).toBe('letter')
    expect(defaultPaper('es-ES')).toBe('a4')
    expect(defaultPaper('en')).toBe('a4')
  })
})

describe('buildProxyPdf', () => {
  const jpeg = (n: number) => ({ jpeg: new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]), width: 10, height: 14 })

  it('stores each picture once, fills 9 slots a page, and writes a correct xref table', () => {
    const layout = pageLayout('letter', 'mtg')
    const bytes = buildProxyPdf(layout, [jpeg(1), jpeg(2)], [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0])
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2)
    expect(text).toContain('/Count 2')
    expect(text.match(/\/Im\d Do/g)).toHaveLength(11)

    // Every object's xref offset points at its "n 0 obj" line.
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref')
    const entries = text.slice(xrefAt).split('\n').slice(3).filter((l) => / n $/.test(l))
    entries.forEach((line, i) => {
      const offset = Number(line.slice(0, 10))
      expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`)
    })
  })
})
