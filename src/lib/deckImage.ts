import type { Card, Deck, DeckCardEntry, DeckFreeTextEntry } from '../shared/types'
import type { GameAdapter } from '../shared/games/types'

const THUMB_WIDTH = 100
const GAP = 8
const CANVAS_WIDTH = 1000
const PADDING = 28

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

export async function renderDeckImage(deck: Deck, adapter: GameAdapter, cardsById: Map<string, Card>): Promise<string> {
  // Gather every card image we'll need, de-duplicated, and load them all up front.
  const neededCards = new Map<string, Card>()
  for (const entries of Object.values<DeckCardEntry[]>(deck.zones)) {
    for (const entry of entries) {
      const card = cardsById.get(entry.cardId)
      if (card?.imageUrl) neededCards.set(card.id, card)
    }
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

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  const ctx = canvas.getContext('2d')!

  let y = PADDING

  function drawHeader() {
    ctx.fillStyle = '#e8e9ee'
    ctx.font = '700 26px sans-serif'
    ctx.fillText(deck.name, PADDING, y + 26)
    y += 34
    ctx.fillStyle = '#9a9db3'
    ctx.font = '400 13px sans-serif'
    ctx.fillText(adapter.name, PADDING, y + 14)
    y += 32
  }

  function drawSectionLabel(label: string) {
    ctx.fillStyle = '#9a9db3'
    ctx.font = '600 14px sans-serif'
    ctx.fillText(label.toUpperCase(), PADDING, y + 12)
    y += 22
  }

  function drawThumbRow(entries: ThumbEntry[]) {
    let x = PADDING
    let rowHeight = 0
    const maxX = CANVAS_WIDTH - PADDING

    for (const { card, quantity } of entries) {
      const img = imageCache.get(card.id)
      if (!img) continue
      const h = Math.round(THUMB_WIDTH * (img.naturalHeight / img.naturalWidth))

      if (x + THUMB_WIDTH > maxX) {
        x = PADDING
        y += rowHeight + GAP
        rowHeight = 0
      }

      ctx.drawImage(img, x, y, THUMB_WIDTH, h)
      if (quantity > 1) {
        ctx.fillStyle = '#7c9eff'
        ctx.beginPath()
        ctx.arc(x + THUMB_WIDTH - 12, y + 12, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#10131f'
        ctx.font = '700 12px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(String(quantity), x + THUMB_WIDTH - 12, y + 16)
        ctx.textAlign = 'left'
      }

      rowHeight = Math.max(rowHeight, h)
      x += THUMB_WIDTH + GAP
    }

    y += rowHeight + GAP + 14
  }

  function drawTextChips(labels: { label: string; quantity: number }[]) {
    let x = PADDING
    for (const { label, quantity } of labels) {
      const text = `${quantity}x ${label}`
      ctx.font = '600 12px sans-serif'
      const w = ctx.measureText(text).width + 20
      if (x + w > CANVAS_WIDTH - PADDING) {
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

  // First pass: measure total height by simulating layout on a throwaway context of the same width.
  // Simpler: draw twice — once to measure (into a temp canvas), once for real — but since our draw
  // functions are deterministic given the same inputs, we instead just render generously tall then crop.
  const MAX_HEIGHT = 4000
  canvas.height = MAX_HEIGHT

  drawHeader()

  for (const zone of adapter.deckRules.zones) {
    if (zone.freeText) {
      const entries: DeckFreeTextEntry[] = deck.freeTextZones[zone.id] ?? []
      if (entries.length === 0) continue
      drawSectionLabel(zone.label)
      drawTextChips(entries.map((e) => ({ label: e.label, quantity: e.quantity })))
      continue
    }

    const entries = deck.zones[zone.id] ?? []
    if (entries.length === 0) continue
    const thumbs: ThumbEntry[] = []
    for (const entry of entries) {
      const card = cardsById.get(entry.cardId)
      if (card) thumbs.push({ card, quantity: entry.quantity })
    }
    if (thumbs.length === 0) continue
    drawSectionLabel(zone.label)
    drawThumbRow(thumbs)
  }

  // Crop to actual content height.
  const finalHeight = Math.min(MAX_HEIGHT, y + PADDING)
  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = CANVAS_WIDTH
  finalCanvas.height = finalHeight
  const finalCtx = finalCanvas.getContext('2d')!
  finalCtx.fillStyle = '#14151a'
  finalCtx.fillRect(0, 0, CANVAS_WIDTH, finalHeight)
  finalCtx.drawImage(canvas, 0, 0)

  return finalCanvas.toDataURL('image/png')
}
