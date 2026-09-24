import type { Card, Deck, DeckCardEntry, DeckFreeTextEntry } from '../shared/types'
import type { GameAdapter } from '../shared/games/types'
import { rulesForFormat } from '../shared/games/rules'
import { IMAGE_PADDING as PADDING, THUMB_GAP as GAP, THUMB_WIDTH as TARGET_WIDTH, columnsFor, imageWidthFor } from '../shared/exportImage'
import { encodeUnderLimit } from './encodeImage'
import { mergePrintings } from '../shared/deckView'

async function loadImage(url: string): Promise<HTMLImageElement> {
  const dataUri = await window.api.images.fetchDataUri(url)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to decode image: ${url}`))
    img.src = dataUri
  })
}

interface ThumbEntry {
  card: Card
  quantity: number
}

/**
 * The deck as one picture. A card whose image can't be loaded is drawn as a card-shaped tile with its
 * name instead of being left out - leaving them out is how a Yu-Gi-Oh deck on the phone app came out
 * as an empty picture (YGOPRODeck's image server doesn't allow a web page to draw its images; the
 * desktop app reads them from its own cache and isn't affected). `missingImages` says how many.
 */
export async function renderDeckImage(deck: Deck, adapter: GameAdapter, cardsById: Map<string, Card>): Promise<{ dataUrl: string; missingImages: number }> {
  // Gather every card image we'll need, de-duplicated, and load them all up front.
  const neededCards = new Map<string, Card>()
  for (const entries of Object.values<DeckCardEntry[]>(deck.zones)) {
    for (const { card } of mergePrintings(entries, cardsById)) neededCards.set(card.id, card)
  }

  const imageCache = new Map<string, HTMLImageElement>()
  await Promise.all(
    [...neededCards.values()].map(async (card) => {
      try {
        const img = await loadImage(card.imageUrl!)
        imageCache.set(card.id, img)
      } catch {
        // Skip cards whose image failed to load; the section will just show fewer thumbnails.
      }
    }),
  )

  // How many cards go in a row depends on how many different cards there are, so the whole deck fits in one look.
  const thumbCount = neededCards.size
  const missingImages = [...neededCards.keys()].filter((id) => !imageCache.has(id)).length
  const canvasWidth = imageWidthFor(columnsFor(thumbCount))
  const totalCards = Object.values<DeckCardEntry[]>(deck.zones).reduce((sum, entries) => sum + entries.reduce((n, e) => n + e.quantity, 0), 0)

  // Runs the exact same draw sequence against whatever context it's given
  // and returns the final y (content height). Called once against a tiny
  // throwaway canvas just to measure — text metrics and image aspect
  // ratios don't depend on the canvas's actual size — then again against
  // the real, correctly-sized canvas. This replaces a previous "render
  // generously tall then crop" approach that allocated a flat 60000px-tall
  // scratch canvas (~600MB) for every export, even a 5-card deck.
  function runLayout(ctx: CanvasRenderingContext2D): number {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    let y = PADDING

    function drawHeader() {
      ctx.fillStyle = '#e8e9ee'
      ctx.font = '700 34px sans-serif'
      ctx.fillText(deck.name, PADDING, y + 34)
      y += 44
      ctx.fillStyle = '#9a9db3'
      ctx.font = '400 16px sans-serif'
      ctx.fillText(`${adapter.name} · ${totalCards} cards`, PADDING, y + 16)
      y += 36
    }

    function drawSectionLabel(label: string) {
      ctx.fillStyle = '#9a9db3'
      ctx.font = '600 18px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(label.toUpperCase(), PADDING, y + 14)
      y += 28
    }

    function drawThumbRow(entries: ThumbEntry[]) {
      let x = PADDING
      let rowHeight = 0
      const maxX = canvasWidth - PADDING

      for (const { card, quantity } of entries) {
        const img = imageCache.get(card.id)
        const w = img ? Math.min(TARGET_WIDTH, img.naturalWidth) : TARGET_WIDTH
        const h = img ? Math.round(w * (img.naturalHeight / img.naturalWidth)) : Math.round(w * (card.orientation === 'landscape' ? 5 / 7 : 7 / 5))

        if (x + w > maxX) {
          x = PADDING
          y += rowHeight + GAP
          rowHeight = 0
        }

        if (img) ctx.drawImage(img, x, y, w, h)
        else drawNameTile(card, x, y, w, h)
        if (quantity > 1) {
          const r = Math.max(14, Math.round(w * 0.08))
          ctx.fillStyle = '#7c9eff'
          ctx.beginPath()
          ctx.arc(x + w - r - 4, y + r + 4, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#10131f'
          ctx.font = `700 ${Math.round(r * 1.15)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(quantity), x + w - r - 4, y + r + 5)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'alphabetic'
        }

        rowHeight = Math.max(rowHeight, h)
        x += w + GAP
      }

      y += rowHeight + GAP + 10
    }

    /** A card-shaped tile with the card's name, for a card whose image couldn't be loaded. */
    function drawNameTile(card: Card, x: number, top: number, w: number, h: number) {
      ctx.fillStyle = '#242631'
      ctx.beginPath()
      ctx.roundRect(x, top, w, h, 10)
      ctx.fill()
      ctx.strokeStyle = '#3d4155'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.fillStyle = '#e8e9ee'
      ctx.font = '600 15px sans-serif'
      ctx.textAlign = 'center'
      const words = card.name.split(/\s+/)
      const lines: string[] = []
      for (const word of words) {
        const last = lines[lines.length - 1]
        if (last && ctx.measureText(`${last} ${word}`).width <= w - 20) lines[lines.length - 1] = `${last} ${word}`
        else lines.push(word)
      }
      const shown = lines.slice(0, 6)
      const lineHeight = 19
      let ly = top + h / 2 - ((shown.length - 1) * lineHeight) / 2
      for (const line of shown) {
        ctx.fillText(line, x + w / 2, ly, w - 16)
        ly += lineHeight
      }
      ctx.fillStyle = '#9a9db3'
      ctx.font = '400 12px sans-serif'
      ctx.fillText(`${card.setCode} ${card.number}`.trim(), x + w / 2, top + h - 14, w - 16)
      ctx.textAlign = 'left'
    }

    function drawTextChips(labels: { label: string; quantity: number }[]) {
      let x = PADDING
      for (const { label, quantity } of labels) {
        const text = `${quantity}x ${label}`
        ctx.font = '600 12px sans-serif'
        const w = ctx.measureText(text).width + 20
        if (x + w > canvasWidth - PADDING) {
          x = PADDING
          y += 30
        }
        ctx.fillStyle = '#242631'
        ctx.beginPath()
        ctx.roundRect(x, y, w, 24, 12)
        ctx.fill()
        ctx.fillStyle = '#e8e9ee'
        ctx.fillText(text, x + 10, y + 16)
        x += w + 8
      }
      y += 30 + 14
    }

    drawHeader()

    for (const zone of rulesForFormat(adapter, deck.formatId).zones) {
      if (zone.freeText) {
        const entries: DeckFreeTextEntry[] = deck.freeTextZones[zone.id] ?? []
        if (entries.length === 0) continue
        drawSectionLabel(zone.label)
        drawTextChips(entries.map((e) => ({ label: e.label, quantity: e.quantity })))
        continue
      }

      const entries = deck.zones[zone.id] ?? []
      if (entries.length === 0) continue
      // One thumbnail per card with its total, like the deck view (printings of a card merged).
      const thumbs: ThumbEntry[] = mergePrintings(entries, cardsById).map(({ card, quantity }) => ({ card, quantity }))
      if (thumbs.length === 0) continue
      drawSectionLabel(`${zone.label} (${thumbs.reduce((n, t) => n + t.quantity, 0)})`)
      drawThumbRow(thumbs)
    }

    return y + PADDING
  }

  const measureCanvas = document.createElement('canvas')
  measureCanvas.width = canvasWidth
  measureCanvas.height = 1
  const finalHeight = runLayout(measureCanvas.getContext('2d')!)

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = finalHeight
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#14151a'
  ctx.fillRect(0, 0, canvasWidth, finalHeight)
  runLayout(ctx)

  return { dataUrl: encodeUnderLimit(canvas), missingImages }
}
