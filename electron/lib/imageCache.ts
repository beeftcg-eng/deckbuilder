import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * A local, on-demand cache for card images that their host asks not to be hotlinked (YGOPRODeck: "download and
 * re-host the images yourself, or your IP gets blacklisted"). The renderer asks for `dbimg://ygo/small/<id>.jpg`;
 * the first time, the image is downloaded — politely — and saved; every time after, it comes from disk. Images never
 * change for a given id, so a cached file is good forever.
 */

export type ImageSize = 'small' | 'full'
export interface ImageRef {
  source: 'ygo'
  size: ImageSize
  id: string
}

const SOURCE_URLS: Record<ImageRef['source'], Record<ImageSize, (id: string) => string>> = {
  ygo: {
    small: (id) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
    full: (id) => `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
  },
}

/** Only the exact shape we mint is accepted, so a crafted address can't reach outside the cache folder or the image host. */
export function parseImageUrl(url: string): ImageRef | null {
  const match = /^dbimg:\/\/(ygo)\/(small|full)\/(\d{1,12})\.jpg$/.exec(url)
  return match ? { source: 'ygo', size: match[2] as ImageSize, id: match[3] } : null
}

export function sourceUrl(ref: ImageRef): string {
  return SOURCE_URLS[ref.source][ref.size](ref.id)
}

export function cacheFile(cacheDir: string, ref: ImageRef): string {
  return join(cacheDir, ref.source, ref.size, `${ref.id}.jpg`)
}

/**
 * Pure spacing decision for slot() below: how long to wait before starting, and the new `lastStart`
 * baseline, given the current time. Kept separate from slot() (and its real setTimeout/performance.now())
 * so the spacing rule itself is exactly, instantly testable — asserting on it through real timers was
 * flaky under CI's timer-resolution jitter (a wait meant to land 20ms apart sometimes measured ~14ms).
 */
export function scheduleSlot(lastStart: number, minGapMs: number, now: number): { waitMs: number; nextLastStart: number } {
  return { waitMs: lastStart + minGapMs - now, nextLastStart: Math.max(now, lastStart + minGapMs) }
}

export interface ImageFetcherOptions {
  cacheDir: string
  fetchImpl?: typeof fetch
  /** Downloads in flight at once. */
  maxConcurrent?: number
  /** Minimum time between starting two downloads, so bursts stay far under the host's 20-requests-a-second limit. */
  minGapMs?: number
  attempts?: number
  retryDelayMs?: number
  userAgent?: string
}

export class ImageFetcher {
  private cacheDir: string
  private fetchImpl: typeof fetch
  private maxConcurrent: number
  private minGapMs: number
  private attempts: number
  private retryDelayMs: number
  private userAgent: string
  private running = 0
  private lastStart = 0
  private waiting: (() => void)[] = []
  private inFlight = new Map<string, Promise<Buffer>>()

  constructor(options: ImageFetcherOptions) {
    this.cacheDir = options.cacheDir
    this.fetchImpl = options.fetchImpl ?? fetch
    this.maxConcurrent = options.maxConcurrent ?? 4
    this.minGapMs = options.minGapMs ?? 70
    this.attempts = options.attempts ?? 3
    this.retryDelayMs = options.retryDelayMs ?? 800
    this.userAgent = options.userAgent ?? 'Deckbuilder/1.0'
  }

  /** The image's bytes: from the cache if it's there, else downloaded once (however many callers ask meanwhile) and saved. */
  get(ref: ImageRef): Promise<Buffer> {
    const file = cacheFile(this.cacheDir, ref)
    const pending = this.inFlight.get(file)
    if (pending) return pending
    const job = this.load(ref, file).finally(() => this.inFlight.delete(file))
    this.inFlight.set(file, job)
    return job
  }

  private async load(ref: ImageRef, file: string): Promise<Buffer> {
    try {
      return await readFile(file)
    } catch {
      // not cached yet
    }
    const bytes = await this.download(sourceUrl(ref))
    await mkdir(dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    await writeFile(temp, bytes)
    await rename(temp, file) // never leave a half-written image where a later read would trust it
    return bytes
  }

  private async slot(): Promise<() => void> {
    while (this.running >= this.maxConcurrent) await new Promise<void>((resolve) => this.waiting.push(resolve))
    this.running++
    // performance.now(), not Date.now(): on Windows the wall clock ticks about every 15 ms, which let starts land early.
    const { waitMs, nextLastStart } = scheduleSlot(this.lastStart, this.minGapMs, performance.now())
    this.lastStart = nextLastStart
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
    return () => {
      this.running--
      this.waiting.shift()?.()
    }
  }

  private async download(url: string): Promise<Buffer> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      const release = await this.slot()
      let permanent = false
      try {
        const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent }, signal: AbortSignal.timeout(30_000) })
        if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) return Buffer.from(await res.arrayBuffer())
        lastError = new Error(`Image request failed (${res.status}): ${url}`)
        permanent = res.status !== 429 && res.status < 500 && res.status !== 200 // a 404 won't get better; a 5xx or 429 might
      } catch (err) {
        lastError = err // dropped connection or timeout: worth another try
      } finally {
        release()
      }
      if (permanent) throw lastError
      if (attempt < this.attempts) await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt))
    }
    throw lastError
  }
}
