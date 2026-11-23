import type { Card } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import { MAX_IMAGE_BYTES, dataUrlBytes } from '../shared/exportImage'
import type { TierList } from '../shared/tierLists'
import { encodeUnderLimit } from './encodeImage'
import { t } from '../shared/i18n'

const PADDING = 32
const LABEL_WIDTH = 170
const CELL_WIDTH = 180
const CELL_HEIGHT = Math.round(CELL_WIDTH * 1.4)
const GAP = 6
const MIN_COLUMNS = 6
const MAX_COLUMNS = 12
/** Phones refuse canvases much bigger than this (iOS: 16.7 million pixels), so a huge picture is drawn scaled down. */
const MAX_CANVAS_PIXELS = 16_000_000
/** Card pictures fetched at once. */
const PARALLEL = 8

async function loadImage(url: string): Promise<HTMLImageElement> {
  const dataUri = await window.api.images.fetchDataUri(url)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to decode image: ${url}`))
    img.src = dataUri
  })
}

async function loadCardImage(card: Card): Promise<HTMLImageElement | null> {
  for (const url of [card.imageUrl, card.imageUrlSmall]) {
    if (!url) continue
    try {
      return await loadImage(url)
    } catch {
      // The next size, else a name tile.
    }
  }
  return null
}

function fitText(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut}…`
}

/** Splits a tier label into lines that fit `width`, at the biggest font size (down to 16px) that keeps it within `height`. */
function layoutLabel(ctx: CanvasRenderingContext2D, label: string, width: number, height: number): { size: number; lines: string[] } {
  for (let size = 56; size >= 16; size -= 4) {
    ctx.font = `700 ${size}px sans-serif`
    const lines: string[] = []
    let line = ''
    for (const word of label.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width <= width || !line) line = next
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    const fits = lines.every((l) => ctx.measureText(l).width <= width) && lines.length * size * 1.15 <= height
    if (fits) return { size, lines }
  }
  ctx.font = '700 16px sans-serif'
  return { size: 16, lines: [fitText(ctx, label, width)] }
}

export interface TierImageOptions {
  /** Draw the unranked cards as a last row. */
  includePool: boolean
}

/**
 * A picture of a tier list, made for videos and posts: the list's name, then each tier as a colored
 * label beside its cards in order. A PNG when it fits under the size cap (crisper text), else a JPEG.
 */
export async function renderTierListImage(list: TierList, lookup: (cardId: string) => Card | undefined, options: TierImageOptions, onProgress?: (done: number, total: number) => void): Promise<string> {
  const rows = list.tiers.map((tier) => ({ label: tier.label, color: tier.color, cardIds: tier.cardIds }))
  if (options.includePool && list.pool.length) rows.push({ label: t.tierLists.unranked, color: '#3d4155', cardIds: list.pool })

  const ids = [...new Set(rows.flatMap((r) => r.cardIds))]
  const images = new Map<string, HTMLImageElement>()
  let done = 0
  let next = 0
  onProgress?.(0, ids.length)
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, ids.length) }, async () => {
      while (next < ids.length) {
        const id = ids[next++]
        const card = lookup(id)
        const img = card ? await loadCardImage(card) : null
        if (img) images.set(id, img)
        onProgress?.(++done, ids.length)
      }
    }),
  )

  const longest = Math.max(0, ...rows.map((r) => r.cardIds.length))
  const columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, longest))
  const width = PADDING * 2 + LABEL_WIDTH + GAP + columns * CELL_WIDTH + (columns + 1) * GAP
  const rowHeights = rows.map((r) => Math.max(1, Math.ceil(r.cardIds.length / columns)) * (CELL_HEIGHT + GAP) + GAP)
  const headerHeight = 44 + 30 + 20
  const footerHeight = 34
  const height = PADDING + headerHeight + rowHeights.reduce((a, b) => a + b + GAP, 0) + footerHeight + PADDING
  const scale = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (width * height)))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#14151a'
  ctx.fillRect(0, 0, width, height)
  const textWidth = width - 2 * PADDING
  let y = PADDING

  ctx.fillStyle = '#e8e9ee'
  ctx.font = '700 38px sans-serif'
  ctx.fillText(fitText(ctx, list.name || t.tierLists.untitled, textWidth), PADDING, y + 36)
  y += 44
  ctx.fillStyle = '#9a9db3'
  ctx.font = '400 18px sans-serif'
  ctx.fillText(fitText(ctx, getAdapter(list.gameId).name, textWidth), PADDING, y + 20)
  y += 30 + 20

  rows.forEach((row, r) => {
    const rowHeight = rowHeights[r]
    const left = PADDING
    // Label
    ctx.fillStyle = row.color
    ctx.fillRect(left, y, LABEL_WIDTH, rowHeight)
    ctx.fillStyle = '#16171c'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const { size, lines } = layoutLabel(ctx, row.label, LABEL_WIDTH - 20, rowHeight - 16)
    const lineHeight = size * 1.15
    lines.forEach((line, i) => ctx.fillText(line, left + LABEL_WIDTH / 2, y + rowHeight / 2 + (i - (lines.length - 1) / 2) * lineHeight))
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    // Cards
    const cardsLeft = left + LABEL_WIDTH + GAP
    ctx.fillStyle = '#1c1e26'
    ctx.fillRect(cardsLeft, y, width - PADDING - cardsLeft, rowHeight)
    row.cardIds.forEach((id, i) => {
      const x = cardsLeft + GAP + (i % columns) * (CELL_WIDTH + GAP)
      const top = y + GAP + Math.floor(i / columns) * (CELL_HEIGHT + GAP)
      const img = images.get(id)
      if (img) {
        // Fitted inside the cell, so a landscape card (a Riftbound battlefield) isn't stretched.
        const fit = Math.min(CELL_WIDTH / img.naturalWidth, CELL_HEIGHT / img.naturalHeight)
        const w = img.naturalWidth * fit
        const h = img.naturalHeight * fit
        ctx.drawImage(img, x + (CELL_WIDTH - w) / 2, top + (CELL_HEIGHT - h) / 2, w, h)
      } else {
        ctx.fillStyle = '#2a2d39'
        ctx.fillRect(x, top, CELL_WIDTH, CELL_HEIGHT)
        ctx.fillStyle = '#c9cbe0'
        ctx.font = '600 16px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(fitText(ctx, lookup(id)?.name ?? id, CELL_WIDTH - 16), x + CELL_WIDTH / 2, top + CELL_HEIGHT / 2)
        ctx.textAlign = 'left'
      }
    })
    y += rowHeight + GAP
  })

  ctx.fillStyle = '#6f7290'
  ctx.font = '400 15px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText(t.tierLists.imageFooter, width - PADDING, y + 24)
  ctx.textAlign = 'left'

  const png = canvas.toDataURL('image/png')
  return dataUrlBytes(png) <= MAX_IMAGE_BYTES ? png : encodeUnderLimit(canvas)
}
