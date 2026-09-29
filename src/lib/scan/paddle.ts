/**
 * A small PaddleOCR (PP-OCR text detection + recognition) on onnxruntime-web, for the card scanner.
 * No OpenCV: text regions are found as connected blobs in the detector's probability map and given
 * an oriented box from their spread, then each line is cut out upright and read. Browser only
 * (canvas); the matching that uses its output lives in src/shared/scan/.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web/wasm'
import type { OcrLine } from '../../shared/scan/evidence'

type Ort = typeof import('onnxruntime-web/wasm')

export interface PaddleModel {
  ort: Ort
  det: InferenceSession
  rec: InferenceSession
  dict: string[]
}

export interface ModelSources {
  /** Model file URL, or its bytes if already downloaded. */
  det: string | Uint8Array
  rec: string | Uint8Array
  dict: string
  /** onnxruntime's .wasm: a folder URL, or the file's own URL. */
  wasm: string | { wasm: string }
}

export async function loadPaddle(urls: ModelSources): Promise<PaddleModel> {
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.wasmPaths = urls.wasm
  const session = (source: string | Uint8Array) =>
    typeof source === 'string'
      ? ort.InferenceSession.create(source, { executionProviders: ['wasm'] })
      : ort.InferenceSession.create(source, { executionProviders: ['wasm'] })
  // Threads need cross-origin isolation, which GitHub Pages can't turn on; one thread works everywhere.
  ort.env.wasm.numThreads = 1
  const [det, rec, dictText] = await Promise.all([
    session(urls.det),
    session(urls.rec),
    fetch(urls.dict).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${urls.dict}`)
      return r.text()
    }),
  ])
  const dict = dictText.replace(/\r/g, '').split('\n')
  if (dict[dict.length - 1] === '') dict.pop()
  dict.push(' ')
  return { ort, det, rec, dict }
}

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

/** RGBA pixels -> the models' planar BGR float input. */
function toInput(img: ImageData, norm: 'imagenet' | 'half', into?: Float32Array, offset = 0): Float32Array {
  const { width: w, height: h, data } = img
  const plane = w * h
  const out = into ?? new Float32Array(3 * plane)
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    if (norm === 'imagenet') {
      out[offset + p] = (b - MEAN[0]) / STD[0]
      out[offset + plane + p] = (g - MEAN[1]) / STD[1]
      out[offset + 2 * plane + p] = (r - MEAN[2]) / STD[2]
    } else {
      out[offset + p] = (b - 0.5) / 0.5
      out[offset + plane + p] = (g - 0.5) / 0.5
      out[offset + 2 * plane + p] = (r - 0.5) / 0.5
    }
  }
  return out
}

interface Box {
  cx: number
  cy: number
  w: number
  h: number
  angle: number
  score: number
}

/** Connected text regions in the probability map -> oriented boxes (map pixels). */
function findBoxes(prob: ArrayLike<number>, w: number, h: number, thresh = 0.3, boxThresh = 0.5, unclip = 1.6): Box[] {
  const label = new Int32Array(w * h).fill(-1)
  const boxes: Box[] = []
  const stack: number[] = []
  const pts: number[] = []
  let id = 0
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || prob[start] <= thresh) continue
    let n = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let syy = 0
    let sxy = 0
    let sp = 0
    pts.length = 0
    stack.push(start)
    label[start] = id
    const visit = (n: number) => {
      if (label[n] === -1 && prob[n] > thresh) {
        label[n] = id
        stack.push(n)
      }
    }
    while (stack.length) {
      const q = stack.pop()!
      const x = q % w
      const y = (q - x) / w
      n++
      sx += x
      sy += y
      sxx += x * x
      syy += y * y
      sxy += x * y
      sp += prob[q]
      pts.push(x, y)
      if (x + 1 < w) visit(q + 1)
      if (x > 0) visit(q - 1)
      if (y + 1 < h) visit(q + w)
      if (y > 0) visit(q - w)
    }
    id++
    if (n < 6 || sp / n < boxThresh) continue
    const mx = sx / n
    const my = sy / n
    const angle0 = 0.5 * Math.atan2(2 * (sxy / n - mx * my), sxx / n - mx * mx - (syy / n - my * my))
    const ca = Math.cos(angle0)
    const sa = Math.sin(angle0)
    let u0 = Infinity
    let u1 = -Infinity
    let v0 = Infinity
    let v1 = -Infinity
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - mx
      const dy = pts[i + 1] - my
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      if (u < u0) u0 = u
      if (u > u1) u1 = u
      if (v < v0) v0 = v
      if (v > v1) v1 = v
    }
    let bw = u1 - u0 + 1
    let bh = v1 - v0 + 1
    if (Math.min(bw, bh) < 3) continue
    const dist = (bw * bh * unclip) / (2 * (bw + bh)) // PaddleOCR's "unclip": grow the tight blob to the full text line
    bw += 2 * dist
    bh += 2 * dist
    const cu = (u0 + u1) / 2
    const cv = (v0 + v1) / 2
    let angle = angle0
    if (bh > bw) {
      ;[bw, bh] = [bh, bw]
      angle += Math.PI / 2
    }
    if (angle > Math.PI / 2) angle -= Math.PI
    if (angle < -Math.PI / 2) angle += Math.PI
    boxes.push({ cx: mx + cu * ca - cv * sa, cy: my + cu * sa + cv * ca, w: bw, h: bh, angle, score: sp / n })
  }
  return boxes
}

function decodeRow(data: ArrayLike<number>, base: number, T: number, C: number, dict: string[]): { text: string; conf: number } {
  let text = ''
  let last = 0
  let confSum = 0
  let count = 0
  for (let t = 0; t < T; t++) {
    let best = 0
    let bestP = -Infinity
    const o = base + t * C
    for (let c = 0; c < C; c++) {
      const p = data[o + c]
      if (p > bestP) {
        bestP = p
        best = c
      }
    }
    if (best !== 0 && best !== last) {
      text += dict[best - 1] ?? ''
      confSum += bestP
      count++
    }
    last = best
  }
  return { text, conf: count ? confSum / count : 0 }
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d', { willReadFrequently: true })!]
}

function rotated(source: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
  const [c, ctx] = canvas2d(source.height, source.width)
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2)
  ctx.drawImage(source, -source.width / 2, -source.height / 2)
  return c
}

export interface RecognizeOptions {
  /** Longest side fed to the detector; the recogniser always reads from the full-size image. */
  detMax?: number
  maxLines?: number
  /** Turn the image a quarter turn and read again when most text runs vertically (a landscape card held sideways). */
  autoRotate?: boolean
}

export interface RecognizeResult {
  lines: OcrLine[]
  /** 0 = as given, 90 / -90 = the image was turned that way before reading. */
  rotation: 0 | 90 | -90
  detMs: number
  recMs: number
}

async function detect(model: PaddleModel, source: HTMLCanvasElement, detMax: number): Promise<{ boxes: Box[]; ms: number }> {
  const W = source.width
  const H = source.height
  const s = Math.min(1, detMax / Math.max(W, H))
  const dw = Math.max(32, Math.round((W * s) / 32) * 32)
  const dh = Math.max(32, Math.round((H * s) / 32) * 32)
  const [, dctx] = canvas2d(dw, dh)
  dctx.drawImage(source, 0, 0, dw, dh)
  const t0 = performance.now()
  const input = new model.ort.Tensor('float32', toInput(dctx.getImageData(0, 0, dw, dh), 'imagenet'), [1, 3, dh, dw])
  const out = await model.det.run({ [model.det.inputNames[0]]: input })
  const prob = (out[model.det.outputNames[0]] as Tensor).data as Float32Array
  const rx = W / dw
  const ry = H / dh
  const boxes = findBoxes(prob, dw, dh).map((b) => ({
    ...b,
    cx: b.cx * rx,
    cy: b.cy * ry,
    w: b.w * Math.hypot(rx * Math.cos(b.angle), ry * Math.sin(b.angle)),
    h: b.h * Math.hypot(rx * Math.sin(b.angle), ry * Math.cos(b.angle)),
  }))
  return { boxes, ms: performance.now() - t0 }
}

const REC_H = 48

/** Reads the boxed lines, several at a time: lines of similar length are padded to one width and run as a batch. */
async function recognizeBoxes(model: PaddleModel, source: HTMLCanvasElement, boxes: Box[]): Promise<OcrLine[]> {
  const W = source.width
  const H = source.height
  const items = boxes.map((b) => ({ b, lw: Math.max(16, Math.min(1280, Math.round((b.w / b.h) * REC_H))) }))
  items.sort((a, c) => a.lw - c.lw)
  const lines: OcrLine[] = []
  const [lc, lctx] = canvas2d(16, REC_H)
  const MAX_BATCH = 8
  for (let i = 0; i < items.length; ) {
    // Batch neighbours whose width is within 25% (little padding wasted).
    let j = i + 1
    while (j < items.length && j - i < MAX_BATCH && items[j].lw <= items[i].lw * 1.25 + 16) j++
    const group = items.slice(i, j)
    const bw = Math.ceil(group[group.length - 1].lw / 8) * 8
    const plane = bw * REC_H
    const data = new Float32Array(group.length * 3 * plane)
    lc.width = bw
    group.forEach(({ b }, k) => {
      lctx.setTransform(1, 0, 0, 1, 0, 0)
      lctx.fillStyle = '#000'
      lctx.fillRect(0, 0, bw, REC_H)
      const scale = REC_H / b.h
      lctx.setTransform(scale, 0, 0, scale, 0, 0)
      lctx.translate(b.w / 2, b.h / 2)
      lctx.rotate(-b.angle)
      lctx.translate(-b.cx, -b.cy)
      lctx.drawImage(source, 0, 0)
      toInput(lctx.getImageData(0, 0, bw, REC_H), 'half', data, k * 3 * plane)
    })
    const out = await model.rec.run({ [model.rec.inputNames[0]]: new model.ort.Tensor('float32', data, [group.length, 3, REC_H, bw]) })
    const t = out[model.rec.outputNames[0]] as Tensor
    const [, T, C] = t.dims as number[]
    group.forEach(({ b }, k) => {
      const { text, conf } = decodeRow(t.data as Float32Array, k * T * C, T, C, model.dict)
      if (!text.trim()) return
      const ca = Math.abs(Math.cos(b.angle))
      const sa = Math.abs(Math.sin(b.angle))
      const bbw = b.w * ca + b.h * sa
      const bbh = b.w * sa + b.h * ca
      lines.push({ text, conf, box: { x: (b.cx - bbw / 2) / W, y: (b.cy - bbh / 2) / H, w: bbw / W, h: bbh / H }, textHeight: b.h / H })
    })
    i = j
  }
  lines.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  return lines
}

/** How much readable text a result holds - to choose between reading a card one way up or turned. */
function textQuality(lines: OcrLine[]): number {
  return lines.reduce((sum, l) => sum + l.conf * l.text.replace(/[^A-Za-z]/g, '').length, 0)
}

export async function recognize(model: PaddleModel, source: HTMLCanvasElement, options: RecognizeOptions = {}): Promise<RecognizeResult> {
  const { detMax = 960, maxLines = 40, autoRotate = true } = options
  const t0 = performance.now()
  let { boxes, ms: detMs } = await detect(model, source, detMax)
  const vertical = boxes.filter((b) => Math.abs(b.angle) > Math.PI / 4).length
  if (autoRotate && boxes.length >= 4 && vertical > boxes.length * 0.6) {
    // Sideways text: read it turned both ways and keep whichever reads as more text (one of them is upside down).
    const tries: { image: HTMLCanvasElement; rotation: 90 | -90; lines: OcrLine[] }[] = []
    for (const clockwise of [true, false]) {
      const turned = rotated(source, clockwise)
      const d = await detect(model, turned, detMax)
      detMs += d.ms
      const top = d.boxes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, maxLines)
      tries.push({ image: turned, rotation: clockwise ? 90 : -90, lines: await recognizeBoxes(model, turned, top) })
    }
    const best = tries.sort((a, b) => textQuality(b.lines) - textQuality(a.lines))[0]
    return { lines: best.lines, rotation: best.rotation, detMs, recMs: performance.now() - t0 - detMs }
  }
  boxes = boxes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, maxLines)
  const lines = await recognizeBoxes(model, source, boxes)
  return { lines, rotation: 0, detMs, recMs: performance.now() - t0 - detMs }
}
