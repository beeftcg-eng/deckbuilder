/**
 * The phone app's card scanner, minus its screen (ScannerModal.tsx): loads the OCR models, cuts the
 * card out of a camera frame, reads it (paddle.ts), matches the text to printings
 * (shared/scan/match.ts) and ranks the printings the text can't separate by how their pictures
 * compare with the photo (shared/scan/visual.ts). Phone-app only: the desktop build never imports it
 * (see __SCANNER__ in vite.config.ts).
 */
import detUrl from './models/det.onnx?url'
import recUrl from './models/rec.onnx?url'
import dictUrl from './models/dict.txt?url'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'
import { loadPaddle, recognize, type PaddleModel } from './paddle'
import { buildScanIndex, type ScanIndex } from '../../shared/scan/scanIndex'
import { identify, textTies, type Candidate, type MatchResult } from '../../shared/scan/match'
import { describeCardImage, describePhoto, visualSimilarity, type RawImage } from '../../shared/scan/visual'
import type { Card, GameId } from '../../shared/types'

// ---------- models ----------

let modelPromise: Promise<PaddleModel> | null = null

async function download(url: string, onBytes: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${res.status} ${url}`)
  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onBytes(loaded, total)
  }
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/**
 * The OCR models (about 12 MB, plus onnxruntime's 14 MB engine), downloaded the first time the
 * scanner opens and cached by the browser after that. `onProgress` gets 0..1 for the model files.
 */
export function loadScannerModel(onProgress?: (fraction: number) => void): Promise<PaddleModel> {
  if (!modelPromise) {
    const progress = { det: [0, 4_745_517], rec: [0, 7_830_888] }
    const report = () => onProgress?.((progress.det[0] + progress.rec[0]) / (progress.det[1] + progress.rec[1]))
    modelPromise = Promise.all([
      download(detUrl, (l, t) => ((progress.det = [l, t || progress.det[1]]), report())),
      download(recUrl, (l, t) => ((progress.rec = [l, t || progress.rec[1]]), report())),
    ])
      .then(([det, rec]) => loadPaddle({ det, rec, dict: dictUrl, wasm: { wasm: wasmUrl } }))
      .catch((err) => {
        modelPromise = null // let the next open try again
        throw err
      })
  }
  return modelPromise
}

// ---------- catalog index ----------

const indexes = new WeakMap<readonly Card[], ScanIndex>()

/** The scanner's index of a game's cards, built once per loaded catalog (up to a second for Magic). */
export function scanIndexFor(gameId: GameId, cards: readonly Card[]): ScanIndex {
  let index = indexes.get(cards)
  if (!index) {
    index = buildScanIndex(gameId, cards)
    indexes.set(cards, index)
  }
  return index
}

// ---------- frames ----------

/** Extra room around the guide, as a fraction of its size, so a card held a little off still fits. */
export const GUIDE_MARGIN = 0.06
const MAX_CROP_SIDE = 1400

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Crop {
  canvas: HTMLCanvasElement
  /** Where the guide (the card, if held as asked) sits in the crop, as fractions of it. */
  inner: Rect
}

/** Cuts the guide area (plus a margin) out of the current video frame. `guide` is in video pixels. */
export function cropFrame(video: HTMLVideoElement, guide: Rect): Crop {
  const mx = guide.w * GUIDE_MARGIN
  const my = guide.h * GUIDE_MARGIN
  const x0 = Math.max(0, guide.x - mx)
  const y0 = Math.max(0, guide.y - my)
  const x1 = Math.min(video.videoWidth, guide.x + guide.w + mx)
  const y1 = Math.min(video.videoHeight, guide.y + guide.h + my)
  const w = x1 - x0
  const h = y1 - y0
  const s = Math.min(1, MAX_CROP_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * s)
  canvas.height = Math.round(h * s)
  canvas.getContext('2d')!.drawImage(video, x0, y0, w, h, 0, 0, canvas.width, canvas.height)
  return { canvas, inner: { x: (guide.x - x0) / w, y: (guide.y - y0) / h, w: guide.w / w, h: guide.h / h } }
}

/**
 * Where the on-screen guide falls in the video's own pixels. The video fills its box with
 * `object-fit: cover`, so part of the frame is cut off at the edges.
 */
export function guideInVideo(guide: Rect, box: { width: number; height: number }, video: { videoWidth: number; videoHeight: number }): Rect {
  const s = Math.max(box.width / video.videoWidth, box.height / video.videoHeight)
  const ox = (video.videoWidth - box.width / s) / 2
  const oy = (video.videoHeight - box.height / s) / 2
  return { x: ox + guide.x / s, y: oy + guide.y / s, w: guide.w / s, h: guide.h / s }
}

/** The card-shaped guide inside a box of this size (the same shape and place the screen draws it). */
export function guideRect(width: number, height: number): Rect {
  // Kept clear of the status box above and the controls along the bottom.
  const w = Math.min(width * 0.78, height * 0.56 * (5 / 7))
  const h = (w * 7) / 5
  return { x: (width - w) / 2, y: Math.max(8, height * 0.43 - h / 2), w, h }
}

// ---------- reading ----------

export interface Reading {
  match: MatchResult
  rotation: 0 | 90 | -90
  ms: number
}

export async function readCard(model: PaddleModel, index: ScanIndex, crop: Crop): Promise<Reading> {
  const t0 = performance.now()
  const ocr = await recognize(model, crop.canvas)
  const match = identify(ocr.lines, index)
  return { match, rotation: ocr.rotation, ms: performance.now() - t0 }
}

// ---------- picture comparison ----------

export interface RankedCandidate extends Candidate {
  /** Picture similarity with the photo (-1..1), null when the image couldn't be loaded. */
  visual: number | null
  final: number
}

const HOSTS_WITH_CORS = new Set(['images.pokemontcg.io', 'images.scrydex.com', 'cards.scryfall.io'])

/** A small copy of the card's image a web page is allowed to read (see webApi.ts's image proxy note). */
export function thumbnailUrl(card: Card): string | null {
  const url = card.imageUrlSmall ?? card.imageUrl
  if (!url || url.startsWith('dbimg:')) return null
  try {
    if (HOSTS_WITH_CORS.has(new URL(url).hostname)) return url
  } catch {
    return null
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=200&output=jpg`
}

type Descriptor = ReturnType<typeof describeCardImage>
const descriptors = new Map<string, Promise<Descriptor | null>>()

function rawImage(source: CanvasImageSource, width: number, height: number): RawImage {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function describeCard(card: Card): Promise<Descriptor | null> {
  const url = thumbnailUrl(card)
  if (!url) return Promise.resolve(null)
  let pending = descriptors.get(url)
  if (!pending) {
    pending = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        const scale = Math.min(1, 200 / Math.max(bitmap.width, bitmap.height))
        const d = describeCardImage(rawImage(bitmap, Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale))))
        bitmap.close()
        return d
      })
      .catch(() => {
        descriptors.delete(url) // try again next time
        return null
      })
    descriptors.set(url, pending)
  }
  return pending
}

/** The same physical printing listed twice in the card data (same code, picture and rarity). */
export function printingKey(card: Card): string {
  return [card.setCode, card.number, card.rarity ?? '', card.imageUrl ?? '', card.sourceId].join('|')
}

/**
 * Ranks the printings the text couldn't tell apart by how their pictures compare with the photo, and
 * merges printings the data lists twice. The text score still counts: a picture only breaks ties.
 */
export async function rankByPicture(reading: Reading, crop: Crop, limit = 30): Promise<RankedCandidate[]> {
  const ties = textTies(reading.match).slice(0, limit)
  // A landscape card held sideways stays sideways here: describeCardImage turns landscape images to match.
  const scale = 240 / crop.canvas.width
  const ps = describePhoto(rawImage(crop.canvas, 240, Math.round(crop.canvas.height * scale)), crop.inner)
  const described = await Promise.all(ties.map((c) => describeCard(c.card)))
  const ranked = ties.map((c, i) => {
    const d = described[i]
    const visual = d ? visualSimilarity(ps, d) : null
    return { ...c, visual, final: c.score + (visual ?? -0.2) }
  })
  // Exact ties (the data uses the same picture for a promo and its regular printing) go to the regular one:
  // most cards scanned aren't promos, and the promo stays one tap away.
  ranked.sort((a, b) => b.final - a.final || Number(isPromo(a.card)) - Number(isPromo(b.card)))
  const seen = new Set<string>()
  return ranked.filter((c) => {
    const key = printingKey(c.card)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isPromo(card: Card): boolean {
  const set = card.setCode.toUpperCase()
  return (
    card.rarity === 'Promo' ||
    card.rarity === 'PR' ||
    set === 'OPP' ||
    set === 'P' ||
    set.startsWith('PR-') ||
    (card.gameId === 'mtg' && set.length >= 4 && set.startsWith('P'))
  )
}

/** Whether the top printing clearly beats the next one, so it can be trusted without a look. */
export function isConfident(ranked: readonly RankedCandidate[], reading: Reading): boolean {
  const [best, next] = ranked
  if (!best || reading.match.status === 'unsure' || reading.match.status === 'none') return false
  if (best.nameScore < 0.75 && best.codeWeight < 0.9) return false
  return !next || best.final - next.final >= 0.04
}
