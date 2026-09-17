import type { GameId } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import type { ResolvedWishlistEntry } from '../shared/export'

// Card art/text needs to hold up to zooming in on the exported image, not
// just be "readable at a glance" — so this targets close to the card's
// own native resolution (source images run roughly 600-1000px wide
// across these games) rather than a small thumbnail. Never upscaled
// past a card's actual resolution (see Math.min below) since that would
// make lower-res sources blurrier, not sharper.
const TARGET_WIDTH = 600
const GAP = 24
const PADDING = 40
const PER_ROW = 4
const CANVAS_WIDTH = PER_ROW * TARGET_WIDTH + (PER_ROW - 1) * GAP + 2 * PADDING
const MAX_HEIGHT = 60000

async function loadImage(url: string): Promise<HTMLImageElement> {
  const dataUri = await window.api.images.fetchDataUri(url)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to decode image: ${url}`))
    img.src = dataUri
  })
}

export async function renderWishlistImage(entries: ResolvedWishlistEntry[]): Promise<string> {
  const imageCache = new Map<string, HTMLImageElement>()
  await Promise.all(
    entries
      .filter((e) => e.card.imageUrl)
      .map(async (e) => {
        try {
          imageCache.set(e.card.id, await loadImage(e.card.imageUrl!))
        } catch {
          // Skip cards whose image failed to load; they just won't get a thumbnail.
        }
      }),
  )

  const byGame = new Map<GameId, ResolvedWishlistEntry[]>()
  for (const entry of entries) {
    const list = byGame.get(entry.card.gameId) ?? []
    list.push(entry)
    byGame.set(entry.card.gameId, list)
  }

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = MAX_HEIGHT
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  let y = PADDING

  ctx.fillStyle = '#e8e9ee'
  ctx.font = '700 34px sans-serif'
  ctx.fillText('Card Wishlist', PADDING, y + 34)
  y += 44

  const total = entries.reduce((sum, e) => sum + e.quantity, 0)
  ctx.fillStyle = '#9a9db3'
  ctx.font = '400 16px sans-serif'
  ctx.fillText(`${total} card${total === 1 ? '' : 's'} wanted`, PADDING, y + 16)
  y += 36

  for (const [gameId, list] of byGame) {
    ctx.fillStyle = '#9a9db3'
    ctx.font = '600 18px sans-serif'
    ctx.fillText(getAdapter(gameId).shortName.toUpperCase(), PADDING, y + 14)
    y += 28

    let x = PADDING
    let rowHeight = 0
    const maxX = CANVAS_WIDTH - PADDING

    for (const { card, quantity } of list) {
      const img = imageCache.get(card.id)
      if (!img) continue
      const w = Math.min(TARGET_WIDTH, img.naturalWidth)
      const h = Math.round(w * (img.naturalHeight / img.naturalWidth))

      if (x + w > maxX) {
        x = PADDING
        y += rowHeight + GAP
        rowHeight = 0
      }

      ctx.drawImage(img, x, y, w, h)
      if (quantity > 1) {
        const r = Math.round(w * 0.065)
        ctx.fillStyle = '#7c9eff'
        ctx.beginPath()
        ctx.arc(x + w - r - 4, y + r + 4, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#10131f'
        ctx.font = `700 ${Math.round(r * 1.1)}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(String(quantity), x + w - r - 4, y + r + 5)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
      }

      rowHeight = Math.max(rowHeight, h)
      x += w + GAP
    }

    y += rowHeight + GAP + 14
  }

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
