import type { Card } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import { formatPrice } from '../shared/collection'
import { openingMoneyLine, openingValue, rankedPulls, type PackOpening } from '../shared/packOpenings'
import { IMAGE_PADDING as PADDING, THUMB_GAP as GAP, THUMB_WIDTH as CELL_WIDTH, columnsFor, imageWidthFor } from '../shared/exportImage'
import { encodeUnderLimit } from './encodeImage'
import { t } from '../shared/i18n'

/** A box can hold hundreds of different cards; the picture shows the most valuable ones, the text version lists them all. */
const MAX_CARDS = 60
const CELL_HEIGHT = Math.round(CELL_WIDTH * 1.4)
const CAPTION = 30
/** Phones refuse canvases much bigger than this (iOS: 16.7 million pixels), so a huge picture is drawn scaled down. */
const MAX_CANVAS_PIXELS = 16_000_000

async function loadImage(url: string): Promise<HTMLImageElement> {
  const dataUri = await window.api.images.fetchDataUri(url)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to decode image: ${url}`))
    img.src = dataUri
  })
}

/** Cuts `text` down with an ellipsis until it fits in `width`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut}…`
}

/**
 * A picture of a pack opening to share: its name, date, what was paid and what it's worth, then the
 * pulls as card images, most valuable first, each with its copies and value.
 */
export async function renderPackOpeningImage(opening: PackOpening, lookup: (cardId: string) => Card | undefined, date: string): Promise<string> {
  const value = openingValue(opening, lookup)
  const pulls = rankedPulls(opening, lookup)
  const shown = pulls.slice(0, MAX_CARDS)
  const hiddenCount = pulls.length - shown.length

  const images = new Map<string, HTMLImageElement>()
  await Promise.all(
    shown.map(async ({ cardId, card }) => {
      if (!card?.imageUrl) return
      try {
        images.set(cardId, await loadImage(card.imageUrl))
      } catch {
        // Drawn as a name tile instead.
      }
    }),
  )

  const columns = Math.max(3, Math.min(columnsFor(shown.length), Math.max(shown.length, 1)))
  const width = imageWidthFor(columns)
  const rows = Math.ceil(shown.length / columns)
  const headerHeight = 44 + 32 + 36 + (value.best ? 30 : 0) + 16
  const height = PADDING + headerHeight + rows * (CELL_HEIGHT + CAPTION + GAP) + (hiddenCount > 0 ? 34 : 0) + PADDING
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
  ctx.font = '700 34px sans-serif'
  ctx.fillText(fitText(ctx, opening.name, textWidth), PADDING, y + 34)
  y += 44

  ctx.fillStyle = '#9a9db3'
  ctx.font = '400 17px sans-serif'
  ctx.fillText(fitText(ctx, t.packs.imageHeader(getAdapter(opening.gameId).shortName, date, value.copies), textWidth), PADDING, y + 18)
  y += 32

  ctx.font = '700 22px sans-serif'
  ctx.fillStyle = value.result == null ? '#e8e9ee' : value.result >= 0 ? '#5fd08a' : '#ff7070'
  ctx.fillText(fitText(ctx, openingMoneyLine(opening, value), textWidth), PADDING, y + 24)
  y += 36

  if (value.best) {
    ctx.fillStyle = '#c9cbe0'
    ctx.font = '400 17px sans-serif'
    ctx.fillText(fitText(ctx, t.packs.bestPull(value.best.card.name, formatPrice(value.best.value)), textWidth), PADDING, y + 18)
    y += 30
  }
  y += 16

  shown.forEach(({ cardId, card, quantity, value: pullValue }, i) => {
    const x = PADDING + (i % columns) * (CELL_WIDTH + GAP)
    const top = y + Math.floor(i / columns) * (CELL_HEIGHT + CAPTION + GAP)
    const img = images.get(cardId)
    if (img) {
      // Fitted inside the cell, so a landscape card (a Riftbound battlefield) isn't stretched.
      const fit = Math.min(CELL_WIDTH / img.naturalWidth, CELL_HEIGHT / img.naturalHeight)
      const w = img.naturalWidth * fit
      const h = img.naturalHeight * fit
      ctx.drawImage(img, x + (CELL_WIDTH - w) / 2, top + (CELL_HEIGHT - h) / 2, w, h)
    } else {
      ctx.fillStyle = '#23252e'
      ctx.fillRect(x, top, CELL_WIDTH, CELL_HEIGHT)
      ctx.fillStyle = '#c9cbe0'
      ctx.font = '600 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(fitText(ctx, card?.name ?? cardId, CELL_WIDTH - 20), x + CELL_WIDTH / 2, top + CELL_HEIGHT / 2)
      ctx.textAlign = 'left'
    }

    if (quantity > 1) {
      const r = 22
      ctx.fillStyle = '#7c9eff'
      ctx.beginPath()
      ctx.arc(x + CELL_WIDTH - r - 6, top + r + 6, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#10131f'
      ctx.font = '700 24px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${quantity}`, x + CELL_WIDTH - r - 6, top + r + 7)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    }

    if (pullValue != null) {
      ctx.fillStyle = '#e8e9ee'
      ctx.font = '600 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(formatPrice(pullValue), x + CELL_WIDTH / 2, top + CELL_HEIGHT + 22)
      ctx.textAlign = 'left'
    }
  })
  y += rows * (CELL_HEIGHT + CAPTION + GAP)

  if (hiddenCount > 0) {
    ctx.fillStyle = '#9a9db3'
    ctx.font = '400 17px sans-serif'
    ctx.fillText(fitText(ctx, t.packs.moreCards(hiddenCount), textWidth), PADDING, y + 20)
  }

  return encodeUnderLimit(canvas)
}
