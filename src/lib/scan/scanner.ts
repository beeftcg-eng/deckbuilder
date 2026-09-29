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
import webgpuWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import { loadPaddle, recognize, warmUp, type PaddleModel } from './paddle'
import { buildScanIndex, type ScanIndex } from '../../shared/scan/scanIndex'
import { firstPassIsEnough, identify, textTies, type Candidate, type MatchResult } from '../../shared/scan/match'
import type { OcrLine } from '../../shared/scan/evidence'
import { describeCardImage, describePhoto, visualSimilarity, type RawImage } from '../../shared/scan/visual'
import type { Card, GameId } from '../../shared/types'

// ---------- models ----------

let modelPromise: Promise<PaddleModel> | null = null
let modelBytes: { det: Uint8Array; rec: Uint8Array } | null = null

/**
 * Some phones report WebGPU but fail once the models actually run on it. Then the models are loaded
 * again on the CPU engine, into the same object the scanner already holds.
 */
async function fallBackToCpu(model: PaddleModel): Promise<void> {
  if (model.backend !== 'webgpu' || !modelBytes) return
  const cpu = await loadPaddle({ det: modelBytes.det, rec: modelBytes.rec, dict: dictUrl, wasm: wasmUrl })
  await warmUp(cpu, 1000, 1400, DET_MAX).catch(() => undefined)
  Object.assign(model, cpu)
}

/**
 * The GPU engine is only kept if it reads a known phrase right and is actually quick: some phones'
 * GPUs run the models slower than the CPU would, or (rarely) get the numbers wrong without an error.
 */
async function gpuEarnsItsKeep(model: PaddleModel): Promise<boolean> {
  const canvas = document.createElement('canvas')
  canvas.width = 1000
  canvas.height = 1400
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  ctx.font = 'bold 72px sans-serif'
  ctx.fillText('BREWHOUSE 2048', 120, 300)
  const t0 = performance.now()
  const result = await recognize(model, canvas, { detMax: DET_MAX, autoRotate: false })
  const ms = performance.now() - t0
  const read = result.lines.map((l) => l.text.toUpperCase().replace(/[^A-Z0-9]/g, '')).join('')
  // Some fonts' O reads as 0; that's the font, not the GPU.
  return read.replace(/0/g, 'O').includes('BREWHOUSE') && read.includes('2048') && ms < 500
}

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
      .then(async ([det, rec]) => {
        modelBytes = { det, rec }
        const model = await loadPaddle({ det, rec, dict: dictUrl, wasm: wasmUrl, webgpuWasm: webgpuWasmUrl })
        // A card-shaped crop is what every scan feeds it; warming up on that size keeps the first scan quick.
        try {
          await warmUp(model, 1000, 1400, DET_MAX)
          if (model.backend === 'webgpu' && !(await gpuEarnsItsKeep(model))) await fallBackToCpu(model)
        } catch {
          if (model.backend === 'webgpu') await fallBackToCpu(model)
        }
        return model
      })
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
/**
 * Longest side of the image the text detector sees. 640 finds the same cards as 960 did on the test
 * photos (the picture comparison makes up for the odd missed code) at well under half the time.
 */
const DET_MAX = 640
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
  /** How many text lines were read: plenty of text but no match usually means glare on a foil card. */
  lineCount: number
  ms: number
  /** Where the time went: text detection, line recognition, matching. */
  timings: { detMs: number; recMs: number; matchMs: number; secondPass: boolean; backend: string }
}

export async function readCard(model: PaddleModel, index: ScanIndex, crop: Crop): Promise<Reading> {
  const t0 = performance.now()
  // The name, codes and type lines are read first; the rules text only when they weren't enough.
  const options = { detMax: DET_MAX, enough: (lines: OcrLine[]) => firstPassIsEnough(identify(lines, index)) }
  let ocr
  try {
    ocr = await recognize(model, crop.canvas, options)
  } catch (err) {
    if (model.backend !== 'webgpu') throw err
    await fallBackToCpu(model)
    ocr = await recognize(model, crop.canvas, options)
  }
  const t1 = performance.now()
  const match = identify(ocr.lines, index)
  const t2 = performance.now()
  return { match, rotation: ocr.rotation, lineCount: ocr.lines.length, ms: t2 - t0, timings: { detMs: ocr.detMs, recMs: ocr.recMs, matchMs: t2 - t1, secondPass: ocr.secondPass, backend: model.backend } }
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

/** The printings the text can't separate, merged like rankByPicture's but without the picture (shown while it runs). */
export function rankByText(reading: Reading, limit = 30): RankedCandidate[] {
  const seen = new Set<string>()
  return textTies(reading.match)
    .slice(0, limit)
    .map((c) => ({ ...c, visual: null, final: c.score }))
    .sort((a, b) => b.final - a.final || Number(isPromo(a.card)) - Number(isPromo(b.card)))
    .filter((c) => {
      const key = printingKey(c.card)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Whether the top printing clearly beats the next one, so it can be trusted without a look. */
export function isConfident(ranked: readonly RankedCandidate[], reading: Reading): boolean {
  const [best, next] = ranked
  if (!best || reading.match.status === 'unsure' || reading.match.status === 'none') return false
  if (best.nameScore < 0.75 && best.codeWeight < 0.9) return false
  return !next || best.final - next.final >= 0.04
}

// ---------- frame quality ----------

export interface FrameCheck {
  /** Edge contrast of the guide area: blur (a moving card, a missed focus) lowers it. */
  sharpness: number
  /** How much the guide area changed since the previous check, 0..255. */
  motion: number
}

const QUALITY_W = 96
let previousSample: Float32Array | null = null

/**
 * A quick look at the guide area before spending seconds reading it: small grey sample, its
 * Laplacian energy (sharpness) and its difference from the last sample (motion).
 */
export function checkFrame(video: HTMLVideoElement, guide: Rect): FrameCheck {
  const h = Math.max(8, Math.round((QUALITY_W * guide.h) / guide.w))
  const c = document.createElement('canvas')
  c.width = QUALITY_W
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(video, guide.x, guide.y, guide.w, guide.h, 0, 0, QUALITY_W, h)
  const { data } = ctx.getImageData(0, 0, QUALITY_W, h)
  const grey = new Float32Array(QUALITY_W * h)
  for (let i = 0, p = 0; p < grey.length; i += 4, p++) grey[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  let energy = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < QUALITY_W - 1; x++) {
      const p = y * QUALITY_W + x
      const lap = 4 * grey[p] - grey[p - 1] - grey[p + 1] - grey[p - QUALITY_W] - grey[p + QUALITY_W]
      energy += lap * lap
    }
  }
  let motion = 255
  if (previousSample && previousSample.length === grey.length) {
    let diff = 0
    for (let p = 0; p < grey.length; p++) diff += Math.abs(grey[p] - previousSample[p])
    motion = diff / grey.length
  }
  previousSample = grey
  return { sharpness: energy / ((QUALITY_W - 2) * (h - 2)), motion }
}

/**
 * Remembers recent frames' sharpness and says whether this one is worth reading: steady (little
 * change since the last look) and close to the sharpest seen in the last couple of seconds. A card
 * being moved into place, or a blurred frame, would otherwise cost a whole read.
 */
export class FrameGate {
  private steadySharpness: { t: number; sharpness: number }[] = []
  private steadyLooks = 0
  private skipped = 0

  worthReading(check: FrameCheck, now = performance.now()): boolean {
    // Never wait forever: after a few skipped looks (about a second), read anyway.
    if (this.skipped >= 8) {
      this.skipped = 0
      return true
    }
    if (check.motion >= 14) {
      // Still moving: a read now would see a smear.
      this.steadyLooks = 0
      this.skipped++
      return false
    }
    this.steadyLooks++
    // Sharpness is only compared between steady frames: a card sliding over a busy background
    // measures "sharp" from the background alone, which a still card could never match.
    this.steadySharpness = this.steadySharpness.filter((r) => now - r.t < 1500)
    this.steadySharpness.push({ t: now, sharpness: check.sharpness })
    const best = Math.max(...this.steadySharpness.map((r) => r.sharpness))
    if (this.steadyLooks >= 2 && check.sharpness >= best * 0.7) {
      this.skipped = 0
      return true
    }
    this.skipped++
    return false
  }
}
