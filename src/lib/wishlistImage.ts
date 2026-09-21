import type { GameId } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import type { ResolvedWishlistEntry } from '../shared/export'
import { IMAGE_PADDING as PADDING, THUMB_GAP as GAP, THUMB_WIDTH as TARGET_WIDTH, columnsFor, imageWidthFor } from '../shared/exportImage'
import { encodeUnderLimit } from './encodeImage'

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

  const canvasWidth = imageWidthFor(columnsFor(imageCache.size))

  const byGame = new Map<GameId, ResolvedWishlistEntry[]>()
  for (const entry of entries) {
    const list = byGame.get(entry.card.gameId) ?? []
    list.push(entry)
    byGame.set(entry.card.gameId, list)
  }

  // The layout below is deterministic given each card's already-known
  // natural dimensions, so the exact final height can be computed up front
  // instead of allocating a huge "generously tall then crop" scratch canvas
  // (previously a flat 60000px — ~600MB of backing buffer — for every
  // export, even a 2-card wishlist).
  function layoutHeight(): number {
    let y = PADDING + 44 + 36 // title + subtitle
    for (const list of byGame.values()) {
      y += 28 // section label
      let x = PADDING
      let rowHeight = 0
      const maxX = canvasWidth - PADDING
      for (const { card } of list) {
        const img = imageCache.get(card.id)
        if (!img) continue
        const w = Math.min(TARGET_WIDTH, img.naturalWidth)
        const h = Math.round(w * (img.naturalHeight / img.naturalWidth))
        if (x + w > maxX) {
          x = PADDING
          y += rowHeight + GAP
          rowHeight = 0
        }
        rowHeight = Math.max(rowHeight, h)
        x += w + GAP
      }
      y += rowHeight + GAP + 14
    }
    return y + PADDING
  }

  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth
  canvas.height = layoutHeight()
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#14151a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
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
    const maxX = canvasWidth - PADDING

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

    y += rowHeight + GAP + 14
  }

  return encodeUnderLimit(canvas)
}
