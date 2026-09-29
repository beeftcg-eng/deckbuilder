import type { GameId } from '../shared/types'
import { buildProxyPdf, pageLayout, type Paper, type PdfImage, type ProxyCopies } from '../shared/proxies'

/** Print resolution of the card pictures: 300 dpi, what print shops ask for. */
const DPI = 300

async function loadImage(url: string): Promise<HTMLImageElement> {
  const dataUri = await window.api.images.fetchDataUri(url)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to decode image: ${url}`))
    img.src = dataUri
  })
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

async function toJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Couldn’t encode a card picture')
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * One card at print size. A landscape card (a Riftbound Battlefield) is turned to fit the portrait
 * slot, and a card whose picture can't be loaded prints as a plain frame with its name.
 */
async function drawCard(copy: ProxyCopies, widthPx: number, heightPx: number): Promise<{ image: PdfImage; missing: boolean }> {
  const canvas = document.createElement('canvas')
  canvas.width = widthPx
  canvas.height = heightPx
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, widthPx, heightPx)
  let img: HTMLImageElement | null = null
  try {
    if (copy.card.imageUrl) img = await loadImage(copy.card.imageUrl)
  } catch {
    img = null
  }
  if (img) {
    const sideways = img.naturalWidth > img.naturalHeight
    ctx.imageSmoothingQuality = 'high'
    if (sideways) {
      ctx.translate(widthPx, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, 0, 0, heightPx, widthPx)
    } else ctx.drawImage(img, 0, 0, widthPx, heightPx)
  } else {
    const inset = widthPx * 0.04
    ctx.strokeStyle = '#000'
    ctx.lineWidth = widthPx * 0.012
    ctx.strokeRect(inset, inset, widthPx - inset * 2, heightPx - inset * 2)
    ctx.fillStyle = '#000'
    ctx.textAlign = 'center'
    ctx.font = `bold ${Math.round(widthPx * 0.075)}px sans-serif`
    const lines = wrapLines(ctx, copy.card.name, widthPx * 0.8)
    const lineHeight = widthPx * 0.095
    lines.forEach((line, i) => ctx.fillText(line, widthPx / 2, heightPx * 0.4 + i * lineHeight))
    ctx.font = `${Math.round(widthPx * 0.05)}px sans-serif`
    ctx.fillText(`${copy.card.setCode} ${copy.card.number}`.trim(), widthPx / 2, heightPx * 0.4 + lines.length * lineHeight + lineHeight * 0.4)
  }
  return { image: { jpeg: await toJpeg(canvas), width: widthPx, height: heightPx }, missing: !img }
}

export interface ProxyPdf {
  bytes: Uint8Array
  pages: number
  copies: number
  /** Cards whose picture couldn't be loaded, printed as a named frame instead. */
  missingImages: number
}

/** The proxies as a PDF. `onProgress` gets the number of different cards drawn so far. */
export async function renderProxyPdf(copies: ProxyCopies[], gameId: GameId, paper: Paper, onProgress?: (done: number, total: number) => void): Promise<ProxyPdf> {
  const layout = pageLayout(paper, gameId)
  const widthPx = Math.round((layout.card.width / 25.4) * DPI)
  const heightPx = Math.round((layout.card.height / 25.4) * DPI)
  const images: PdfImage[] = []
  const sequence: number[] = []
  let missingImages = 0
  // A few at a time: fast enough, without holding dozens of full-size pictures at once.
  const results: { image: PdfImage; missing: boolean }[] = new Array(copies.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < copies.length) {
      const i = next++
      results[i] = await drawCard(copies[i], widthPx, heightPx)
      onProgress?.(++done, copies.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, copies.length) }, worker))
  results.forEach((result, i) => {
    images.push(result.image)
    if (result.missing) missingImages += 1
    for (let c = 0; c < copies[i].copies; c++) sequence.push(i)
  })
  const bytes = buildProxyPdf(layout, images, sequence)
  return { bytes, pages: Math.ceil(sequence.length / layout.slots.length), copies: sequence.length, missingImages }
}
