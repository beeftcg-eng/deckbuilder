/**
 * A small PaddleOCR (PP-OCR text detection + recognition) on onnxruntime-web, for the card scanner.
 * No OpenCV: text regions are found as connected blobs in the detector's probability map and given
 * an oriented box from their spread, then each line is cut out upright and read. Runs on the GPU
 * (WebGPU) where the browser has it, else on the CPU (WebAssembly). Browser only (canvas); the
 * matching that uses its output lives in src/shared/scan/.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web/wasm'
import type { OcrLine } from '../../shared/scan/evidence'
import { firstPass } from '../../shared/scan/priority'

type Ort = typeof import('onnxruntime-web/wasm')

export interface PaddleModel {
  ort: Ort
  det: InferenceSession
  rec: InferenceSession
  dict: string[]
  /** Where the models run. */
  backend: 'webgpu' | 'wasm'
}

export interface ModelSources {
  /** Model file URL, or its bytes if already downloaded. */
  det: string | Uint8Array
  rec: string | Uint8Array
  dict: string
  /** onnxruntime's CPU engine (.wasm file URL). */
  wasm: string
  /** onnxruntime's GPU-capable engine, used when the browser has WebGPU. */
  webgpuWasm?: string
}

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return Boolean(gpu && (await gpu.requestAdapter()))
  } catch {
    return false
  }
}

async function createSessions(ort: Ort, sources: ModelSources, providers: string[]): Promise<[InferenceSession, InferenceSession]> {
  const options = { executionProviders: providers, graphOptimizationLevel: 'all' as const }
  const create = (source: string | Uint8Array) =>
    typeof source === 'string' ? ort.InferenceSession.create(source, options) : ort.InferenceSession.create(source, options)
  return Promise.all([create(sources.det), create(sources.rec)])
}

export async function loadPaddle(sources: ModelSources): Promise<PaddleModel> {
  const dictPromise = fetch(sources.dict).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${sources.dict}`)
    return r.text()
  })
  let model: Omit<PaddleModel, 'dict'> | null = null
  if (sources.webgpuWasm && (await hasWebGpu())) {
    try {
      const ort = (await import('onnxruntime-web/webgpu')) as unknown as Ort
      ort.env.wasm.wasmPaths = { wasm: sources.webgpuWasm }
      ort.env.wasm.numThreads = 1
      const [det, rec] = await createSessions(ort, sources, ['webgpu', 'wasm'])
      model = { ort, det, rec, backend: 'webgpu' }
    } catch {
      model = null // some GPUs/drivers refuse; the CPU engine works everywhere
    }
  }
  if (!model) {
    const ort = await import('onnxruntime-web/wasm')
    ort.env.wasm.wasmPaths = { wasm: sources.wasm }
    // Threads need cross-origin isolation, which GitHub Pages can't turn on; one thread works everywhere.
    ort.env.wasm.numThreads = 1
    const [det, rec] = await createSessions(ort, sources, ['wasm'])
    model = { ort, det, rec, backend: 'wasm' }
  }
  const dict = (await dictPromise).replace(/\r/g, '').split('\n')
  if (dict[dict.length - 1] === '') dict.pop()
  dict.push(' ')
  return { ...model, dict }
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
  /** The text's own height, before the box is grown to take in the whole line (h): the size it's printed at. */
  th: number
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
    const visit = (q: number) => {
      if (label[q] === -1 && prob[q] > thresh) {
        label[q] = id
        stack.push(q)
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
    const th = Math.min(bw, bh)
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
    boxes.push({ cx: mx + cu * ca - cv * sa, cy: my + cu * sa + cv * ca, w: bw, h: bh, th, angle, score: sp / n })
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
  /** Turn the image a quarter turn when most text runs vertically (a landscape card held sideways). */
  autoRotate?: boolean
  /**
   * Read the most useful lines first (priority.ts) and ask this whether they're enough; the rest
   * (mostly rules text, the slowest part) is only read when it says no.
   */
  enough?: (lines: OcrLine[]) => boolean
}

export interface RecognizeResult {
  lines: OcrLine[]
  /** 0 = as given, 90 / -90 = the image was turned that way before reading. */
  rotation: 0 | 90 | -90
  /** Whether the lines left after the first pass were read too. */
  secondPass: boolean
  detMs: number
  recMs: number
}

function detSize(W: number, H: number, detMax: number): [number, number] {
  const s = Math.min(1, detMax / Math.max(W, H))
  return [Math.max(32, Math.round((W * s) / 32) * 32), Math.max(32, Math.round((H * s) / 32) * 32)]
}

async function detect(model: PaddleModel, source: HTMLCanvasElement, detMax: number): Promise<{ boxes: Box[]; ms: number }> {
  const W = source.width
  const H = source.height
  const [dw, dh] = detSize(W, H, detMax)
  const [, dctx] = canvas2d(dw, dh)
  dctx.drawImage(source, 0, 0, dw, dh)
  const t0 = performance.now()
  const input = new model.ort.Tensor('float32', toInput(dctx.getImageData(0, 0, dw, dh), 'imagenet'), [1, 3, dh, dw])
  const out = await model.det.run({ [model.det.inputNames[0]]: input })
  const prob = (await (out[model.det.outputNames[0]] as Tensor).getData()) as Float32Array
  const rx = W / dw
  const ry = H / dh
  const boxes = findBoxes(prob, dw, dh).map((b) => ({
    ...b,
    cx: b.cx * rx,
    cy: b.cy * ry,
    w: b.w * Math.hypot(rx * Math.cos(b.angle), ry * Math.sin(b.angle)),
    h: b.h * Math.hypot(rx * Math.sin(b.angle), ry * Math.cos(b.angle)),
    th: b.th * Math.hypot(rx * Math.sin(b.angle), ry * Math.cos(b.angle)),
  }))
  return { boxes, ms: performance.now() - t0 }
}

const REC_H = 48
/** Line widths are rounded up to steps of this, so the GPU only ever sees a handful of input shapes. */
const WIDTH_STEP = 64

function lineWidth(b: Box): number {
  return Math.max(16, Math.min(1280, Math.round((b.w / b.h) * REC_H)))
}

/** Reads the boxed lines, several at a time: lines of similar length are padded to one width and run as a batch. */
async function recognizeBoxes(model: PaddleModel, source: HTMLCanvasElement, boxes: Box[]): Promise<OcrLine[]> {
  const W = source.width
  const H = source.height
  const items = boxes.map((b) => ({ b, bw: Math.ceil(lineWidth(b) / WIDTH_STEP) * WIDTH_STEP }))
  items.sort((a, c) => a.bw - c.bw)
  const lines: OcrLine[] = []
  const [lc, lctx] = canvas2d(16, REC_H)
  const MAX_BATCH = 8
  for (let i = 0; i < items.length; ) {
    let j = i + 1
    while (j < items.length && j - i < MAX_BATCH && items[j].bw === items[i].bw) j++
    const group = items.slice(i, j)
    const bw = group[0].bw
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
    const values = (await t.getData()) as Float32Array
    group.forEach(({ b }, k) => {
      const { text, conf } = decodeRow(values, k * T * C, T, C, model.dict)
      if (!text.trim()) return
      const ca = Math.abs(Math.cos(b.angle))
      const sa = Math.abs(Math.sin(b.angle))
      const bbw = b.w * ca + b.h * sa
      const bbh = b.w * sa + b.h * ca
      lines.push({ text, conf, box: { x: (b.cx - bbw / 2) / W, y: (b.cy - bbh / 2) / H, w: bbw / W, h: bbh / H }, textHeight: b.h / H })
    })
    i = j
  }
  return lines
}

/** How much readable text a result holds - to tell a card read right way up from upside down. */
function textQuality(lines: OcrLine[]): number {
  return lines.reduce((sum, l) => sum + l.conf * l.text.replace(/[^A-Za-z]/g, '').length, 0)
}

function sortLines(lines: OcrLine[]): OcrLine[] {
  return lines.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
}

/** The same boxes on the image turned half a turn. */
function flipped(boxes: Box[], W: number, H: number): Box[] {
  return boxes.map((b) => ({ ...b, cx: W - b.cx, cy: H - b.cy }))
}

async function readInPasses(model: PaddleModel, image: HTMLCanvasElement, boxes: Box[], enough?: (lines: OcrLine[]) => boolean): Promise<{ lines: OcrLine[]; secondPass: boolean }> {
  if (!enough) return { lines: sortLines(await recognizeBoxes(model, image, boxes)), secondPass: false }
  const shapes = boxes.map((b) => ({ cy: b.cy / image.height, textHeight: b.th / image.height, width: b.w / image.width }))
  const first = new Set(firstPass(shapes))
  const firstLines = await recognizeBoxes(model, image, boxes.filter((_, i) => first.has(i)))
  if (first.size === boxes.length || enough(sortLines([...firstLines]))) return { lines: sortLines(firstLines), secondPass: false }
  const rest = await recognizeBoxes(model, image, boxes.filter((_, i) => !first.has(i)))
  return { lines: sortLines([...firstLines, ...rest]), secondPass: true }
}

export async function recognize(model: PaddleModel, source: HTMLCanvasElement, options: RecognizeOptions = {}): Promise<RecognizeResult> {
  const { detMax = 960, maxLines = 40, autoRotate = true, enough } = options
  const t0 = performance.now()
  const found = await detect(model, source, detMax)
  let detMs = found.ms
  let image = source
  let boxes = found.boxes
  let rotation: 0 | 90 | -90 = 0
  const vertical = boxes.filter((b) => Math.abs(b.angle) > Math.PI / 4).length
  if (autoRotate && boxes.length >= 4 && vertical > boxes.length * 0.6) {
    // Sideways text: detect once on the image turned clockwise, then read its three biggest lines both
    // ways up (upside-down text reads as junk) to tell whether it should have been turned the other way.
    const turned = rotated(source, true)
    const d = await detect(model, turned, detMax)
    detMs += d.ms
    const sample = [...d.boxes].sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 3)
    const other = rotated(source, false)
    const [asIs, upsideDown] = await Promise.all([
      recognizeBoxes(model, turned, sample),
      recognizeBoxes(model, other, flipped(sample, turned.width, turned.height)),
    ])
    if (textQuality(upsideDown) > textQuality(asIs)) {
      image = other
      boxes = flipped(d.boxes, turned.width, turned.height)
      rotation = -90
    } else {
      image = turned
      boxes = d.boxes
      rotation = 90
    }
  }
  boxes = boxes.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, maxLines)
  const { lines, secondPass } = await readInPasses(model, image, boxes, enough)
  return { lines, rotation, secondPass, detMs, recMs: performance.now() - t0 - detMs }
}

/**
 * Runs both models once on blank input of the sizes a scan will use, so the first real scan doesn't
 * pay for the engine's start-up work (and, on the GPU, for compiling its programs).
 */
export async function warmUp(model: PaddleModel, cropWidth: number, cropHeight: number, detMax = 960): Promise<void> {
  const [dw, dh] = detSize(cropWidth, cropHeight, detMax)
  await model.det.run({ [model.det.inputNames[0]]: new model.ort.Tensor('float32', new Float32Array(3 * dw * dh), [1, 3, dh, dw]) })
  for (const bw of [128, 256, 384, 512]) {
    await model.rec.run({ [model.rec.inputNames[0]]: new model.ort.Tensor('float32', new Float32Array(3 * REC_H * bw), [1, 3, REC_H, bw]) })
  }
}
