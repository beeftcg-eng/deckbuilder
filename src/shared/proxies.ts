import type { Card, Deck, GameId } from './types'
import { poolKey } from './collection'

/**
 * Proxies: a deck's cards laid out at their real size on printable pages, for playtesting a list
 * before buying it. This file picks the copies and does the page math and the PDF bytes; drawing
 * the card pictures is src/lib/proxyPdf.ts.
 */

export interface ProxyCopies {
  card: Card
  copies: number
}

export interface ProxyOptions {
  /** Zones to print; every zone when left out. */
  zoneIds?: ReadonlySet<string>
  /** The order to print zones in (the game's own: Legend before Main Deck); others follow as stored. */
  zoneOrder?: readonly string[]
  /** Copies you own per pool (ownedIndexOf): only the copies you're missing are printed. */
  owned?: ReadonlyMap<string, number>
}

/** The copies to print, in zone order, each printing's own art. */
export function proxyCopies(deck: Deck, cardsById: Map<string, Card>, options: ProxyOptions = {}): ProxyCopies[] {
  const ownedLeft = new Map(options.owned ?? [])
  const byCard = new Map<string, ProxyCopies>()
  const order = options.zoneOrder ?? []
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
  const zones = Object.entries(deck.zones).sort(([a], [b]) => rank(a) - rank(b))
  for (const [zoneId, entries] of zones) {
    if (options.zoneIds && !options.zoneIds.has(zoneId)) continue
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      if (!card || quantity <= 0) continue
      let copies = quantity
      if (options.owned) {
        const key = poolKey(card)
        const have = ownedLeft.get(key) ?? 0
        const used = Math.min(have, copies)
        ownedLeft.set(key, have - used)
        copies -= used
      }
      if (copies <= 0) continue
      const existing = byCard.get(card.id)
      if (existing) existing.copies += copies
      else byCard.set(card.id, { card, copies })
    }
  }
  return [...byCard.values()]
}

// ---------- page layout ----------

export type Paper = 'letter' | 'a4'

export const PAPER_MM: Record<Paper, { width: number; height: number }> = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
}

/** Letter for the Americas (where it's the office size), A4 elsewhere. */
export function defaultPaper(locale: string | undefined): Paper {
  const region = (locale ?? '').split(/[-_]/)[1]?.toUpperCase()
  return region && ['US', 'CA', 'MX', 'CL', 'CO', 'VE', 'PH', 'GT', 'CR', 'DO', 'PR', 'PA', 'SV', 'NI', 'HN'].includes(region) ? 'letter' : 'a4'
}

/** A card's printed size. Yu-Gi-Oh! uses the smaller Japanese size; the rest are poker size. */
export function cardSizeMm(gameId: GameId): { width: number; height: number } {
  return gameId === 'yugioh' ? { width: 59, height: 86 } : { width: 63, height: 88 }
}

/** Printers can't reach the very edge, so nothing is placed closer to it than this. */
const MIN_MARGIN_MM = 6
/** How far the cut marks reach into the margin. */
const MARK_MM = 4

export interface PageLayout {
  columns: number
  rows: number
  /** Top-left corner of each slot on a page, in mm from the page's top-left. */
  slots: { x: number; y: number }[]
  card: { width: number; height: number }
  page: { width: number; height: number }
  /** Cut marks in the margins, in lines from (x1, y1) to (x2, y2), mm from the top-left. */
  marks: { x1: number; y1: number; x2: number; y2: number }[]
}

/** Cards edge to edge in a centred grid (one cut between neighbours), with cut marks in the margins. */
export function pageLayout(paper: Paper, gameId: GameId): PageLayout {
  const page = PAPER_MM[paper]
  const card = cardSizeMm(gameId)
  const columns = Math.floor((page.width - 2 * MIN_MARGIN_MM) / card.width)
  const rows = Math.floor((page.height - 2 * MIN_MARGIN_MM) / card.height)
  const left = (page.width - columns * card.width) / 2
  const top = (page.height - rows * card.height) / 2
  const slots: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) slots.push({ x: left + c * card.width, y: top + r * card.height })
  const marks: PageLayout['marks'] = []
  const right = left + columns * card.width
  const bottom = top + rows * card.height
  for (let c = 0; c <= columns; c++) {
    const x = left + c * card.width
    marks.push({ x1: x, y1: top - MARK_MM - 1, x2: x, y2: top - 1 }, { x1: x, y1: bottom + 1, x2: x, y2: bottom + MARK_MM + 1 })
  }
  for (let r = 0; r <= rows; r++) {
    const y = top + r * card.height
    marks.push({ x1: left - MARK_MM - 1, y1: y, x2: left - 1, y2: y }, { x1: right + 1, y1: y, x2: right + MARK_MM + 1, y2: y })
  }
  return { columns, rows, slots, card, page, marks }
}

// ---------- PDF ----------

export interface PdfImage {
  /** Baseline JPEG bytes (a canvas's toBlob('image/jpeg') output). */
  jpeg: Uint8Array
  width: number
  height: number
}

const PT_PER_MM = 72 / 25.4

function num(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}

/**
 * A PDF with `layout`'s pages, `sequence[i]` being the image in slot i (in page order). Each picture
 * is stored once however many copies use it.
 */
export function buildProxyPdf(layout: PageLayout, images: PdfImage[], sequence: number[]): Uint8Array {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const write = (part: string | Uint8Array) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    chunks.push(bytes)
    length += bytes.length
  }
  const perPage = layout.slots.length
  const pageCount = Math.max(1, Math.ceil(sequence.length / perPage))
  const firstImage = 3
  const firstPage = firstImage + images.length
  const pageObj = (p: number) => firstPage + p * 2
  const startObj = (id: number) => {
    offsets[id] = length
    write(`${id} 0 obj\n`)
  }

  write('%PDF-1.4\n%âãÏÓ\n')
  startObj(1)
  write('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObj(2)
  write(`<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, p) => `${pageObj(p)} 0 R`).join(' ')}] >>\nendobj\n`)
  images.forEach((image, i) => {
    startObj(firstImage + i)
    write(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`)
    write(image.jpeg)
    write('\nendstream\nendobj\n')
  })

  const pageW = layout.page.width * PT_PER_MM
  const pageH = layout.page.height * PT_PER_MM
  const cardW = layout.card.width * PT_PER_MM
  const cardH = layout.card.height * PT_PER_MM
  // PDF measures from the bottom-left, the layout from the top-left.
  const marks = layout.marks.map((m) => `${num(m.x1 * PT_PER_MM)} ${num(pageH - m.y1 * PT_PER_MM)} m ${num(m.x2 * PT_PER_MM)} ${num(pageH - m.y2 * PT_PER_MM)} l S`).join('\n')
  for (let p = 0; p < pageCount; p++) {
    const onPage = sequence.slice(p * perPage, (p + 1) * perPage)
    const used = [...new Set(onPage)]
    const draws = onPage.map((image, slot) => {
      const { x, y } = layout.slots[slot]
      return `q ${num(cardW)} 0 0 ${num(cardH)} ${num(x * PT_PER_MM)} ${num(pageH - y * PT_PER_MM - cardH)} cm /Im${image} Do Q`
    })
    const content = `${draws.join('\n')}\nq 0.5 G 0.4 w\n${marks}\nQ\n`
    startObj(pageObj(p))
    write(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] /Resources << /XObject << ${used.map((i) => `/Im${i} ${firstImage + i} 0 R`).join(' ')} >> >> /Contents ${pageObj(p) + 1} 0 R >>\nendobj\n`,
    )
    startObj(pageObj(p) + 1)
    const stream = encoder.encode(content)
    write(`<< /Length ${stream.length} >>\nstream\n`)
    write(stream)
    write('\nendstream\nendobj\n')
  }

  const objectCount = firstPage + pageCount * 2
  const xrefAt = length
  write(`xref\n0 ${objectCount}\n0000000000 65535 f \n`)
  for (let id = 1; id < objectCount; id++) write(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.length
  }
  return out
}
