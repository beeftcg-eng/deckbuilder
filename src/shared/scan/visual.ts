/**
 * Picture comparison between the camera frame and candidate printings' images - what tells apart
 * printings the text can't: alternate arts sharing a number, a promo's stamp, a black border (Alpha)
 * from a white one (Revised). Both pictures are reduced to a small grid of colours, normalised per
 * channel so lighting and white balance matter less, and correlated. The card is never exactly where
 * the guide says, so the photo is searched over small shifts and sizes. Pure (works on raw RGBA), so
 * the scanner and the tests share it.
 */

export interface RawImage {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

/** Grid size: about a card's 5:7. Fine enough to see a stamp's colour or a border, coarse enough to ignore blur. */
export const GRID_W = 20
export const GRID_H = 28

/** Summed-area tables of R, G, B for exact box averages. */
interface Integral {
  w: number
  h: number
  sums: Float64Array[] // 3 channels, (w+1)*(h+1)
}

function integral(img: RawImage): Integral {
  const w = img.width
  const h = img.height
  const sums = [0, 1, 2].map(() => new Float64Array((w + 1) * (h + 1)))
  for (let c = 0; c < 3; c++) {
    const s = sums[c]
    for (let y = 1; y <= h; y++) {
      let row = 0
      for (let x = 1; x <= w; x++) {
        row += img.data[((y - 1) * w + (x - 1)) * 4 + c]
        s[y * (w + 1) + x] = s[(y - 1) * (w + 1) + x] + row
      }
    }
  }
  return { w, h, sums }
}

function boxMean(ii: Integral, c: number, x0: number, y0: number, x1: number, y1: number): number {
  const W = ii.w + 1
  const ax = Math.max(0, Math.min(ii.w, Math.round(x0)))
  const ay = Math.max(0, Math.min(ii.h, Math.round(y0)))
  const bx = Math.max(ax + 1, Math.min(ii.w, Math.round(x1)))
  const by = Math.max(ay + 1, Math.min(ii.h, Math.round(y1)))
  const s = ii.sums[c]
  return (s[by * W + bx] - s[ay * W + bx] - s[by * W + ax] + s[ay * W + ax]) / ((bx - ax) * (by - ay))
}

/**
 * A normalised colour descriptor of a rectangle of the image: GRID_W x GRID_H cells, each as
 * brightness plus two colour-opponent channels, every channel scaled to zero mean / unit variance.
 */
/** rotate: 0 = as is, 1 = a landscape image turned clockwise to portrait, -1 = anticlockwise. */
function describe(ii: Integral, x: number, y: number, w: number, h: number, rotate: 0 | 1 | -1 = 0, gw = GRID_W, gh = GRID_H): Float32Array {
  const n = gw * gh
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)]
  const cw = (rotate ? h : w) / gw
  const chh = (rotate ? w : h) / gh
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      // For a landscape image shown sideways, grid cell (gx, gy) reads the image rotated a quarter turn.
      let x0: number, y0: number, x1: number, y1: number
      if (rotate === 1) {
        x0 = x + w - (gy + 1) * chh
        x1 = x + w - gy * chh
        y0 = y + gx * cw
        y1 = y + (gx + 1) * cw
      } else if (rotate === -1) {
        x0 = x + gy * chh
        x1 = x + (gy + 1) * chh
        y0 = y + h - (gx + 1) * cw
        y1 = y + h - gx * cw
      } else {
        x0 = x + gx * cw
        x1 = x + (gx + 1) * cw
        y0 = y + gy * chh
        y1 = y + (gy + 1) * chh
      }
      const r = boxMean(ii, 0, x0, y0, x1, y1)
      const g = boxMean(ii, 1, x0, y0, x1, y1)
      const b = boxMean(ii, 2, x0, y0, x1, y1)
      const i = gy * gw + gx
      ch[0][i] = (r + g + b) / 3
      ch[1][i] = r - g
      ch[2][i] = (r + g) / 2 - b
    }
  }
  const weights = [1, 0.7, 0.7]
  const out = new Float32Array(3 * n)
  for (let c = 0; c < 3; c++) {
    let mean = 0
    for (let i = 0; i < n; i++) mean += ch[c][i]
    mean /= n
    let v = 0
    for (let i = 0; i < n; i++) v += (ch[c][i] - mean) ** 2
    // Colour channels of a nearly grey card are mostly noise: don't blow them up to unit variance.
    const sd = Math.max(Math.sqrt(v / n), c === 0 ? 1 : 12)
    for (let i = 0; i < n; i++) out[c * n + i] = ((ch[c][i] - mean) / sd) * weights[c]
  }
  return out
}

function correlate(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** Descriptor of a candidate printing's image (the whole card). Landscape images are turned to match a card held upright. */
export function describeCardImage(img: RawImage, grid: [number, number] = [GRID_W, GRID_H]): { upright: Float32Array; turned?: Float32Array } {
  const ii = integral(img)
  if (img.width > img.height) return { upright: describe(ii, 0, 0, img.width, img.height, 1, ...grid), turned: describe(ii, 0, 0, img.width, img.height, -1, ...grid) }
  return { upright: describe(ii, 0, 0, img.width, img.height, 0, ...grid) }
}

export interface PhotoSearch {
  /** Descriptors of the card area at each tried position. */
  views: Float32Array[]
}

/**
 * Descriptors of the photo's card area around where the guide put it: `card` is the expected card
 * rectangle as fractions of the image; shifts of up to `shift` of its size and sizes from `scales`
 * are tried.
 */
export function describePhoto(
  img: RawImage,
  card: { x: number; y: number; w: number; h: number },
  { scales = [0.92, 0.97, 1.02], shift = 0.04, steps = 2, grid = [GRID_W, GRID_H] }: { scales?: number[]; shift?: number; steps?: number; grid?: [number, number] } = {},
): PhotoSearch {
  const ii = integral(img)
  const views: Float32Array[] = []
  const cx = (card.x + card.w / 2) * img.width
  const cy = (card.y + card.h / 2) * img.height
  for (const s of scales) {
    const w = card.w * img.width * s
    const h = card.h * img.height * s
    for (let iy = -steps; iy <= steps; iy++) {
      for (let ix = -steps; ix <= steps; ix++) {
        const dx = (ix / steps) * shift * card.w * img.width
        const dy = (iy / steps) * shift * card.h * img.height
        views.push(describe(ii, cx - w / 2 + dx, cy - h / 2 + dy, w, h, 0, ...grid))
      }
    }
  }
  return { views }
}

/** How alike the photo and a candidate image look, -1..1 (best over the tried positions). */
export function visualSimilarity(photo: PhotoSearch, candidate: { upright: Float32Array; turned?: Float32Array }): number {
  let best = -1
  for (const v of photo.views) {
    const s = correlate(v, candidate.upright)
    if (s > best) best = s
    if (candidate.turned) best = Math.max(best, correlate(v, candidate.turned))
  }
  return best
}
