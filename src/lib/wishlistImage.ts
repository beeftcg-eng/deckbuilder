import type { GameId } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import type { ResolvedWishlistEntry } from '../shared/export'

const THUMB_WIDTH = 100
const GAP = 8
const CANVAS_WIDTH = 1000
const PADDING = 28
const MAX_HEIGHT = 8000

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
  let y = PADDING

  ctx.fillStyle = '#e8e9ee'
  ctx.font = '700 26px sans-serif'
  ctx.fillText('Card Wishlist', PADDING, y + 26)
  y += 34

  const total = entries.reduce((sum, e) => sum + e.quantity, 0)
  ctx.fillStyle = '#9a9db3'
  ctx.font = '400 13px sans-serif'
  ctx.fillText(`${total} card${total === 1 ? '' : 's'} wanted`, PADDING, y + 14)
  y += 32

  for (const [gameId, list] of byGame) {
    ctx.fillStyle = '#9a9db3'
    ctx.font = '600 14px sans-serif'
    ctx.fillText(getAdapter(gameId).shortName.toUpperCase(), PADDING, y + 12)
    y += 22

    let x = PADDING
    let rowHeight = 0
    const maxX = CANVAS_WIDTH - PADDING

    for (const { card, quantity } of list) {
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
