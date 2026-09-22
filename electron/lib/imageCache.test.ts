import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageFetcher, cacheFile, parseImageUrl, scheduleSlot, sourceUrl } from './imageCache'
import { normalizeCard } from '../../src/shared/games/yugioh'
import { RAW } from '../../src/shared/games/yugiohFixtures'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4])
const okImage = () => new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'imgcache-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('parseImageUrl', () => {
  it('accepts exactly the addresses the app mints', () => {
    expect(parseImageUrl('dbimg://ygo/small/89631139.jpg')).toEqual({ source: 'ygo', size: 'small', id: '89631139' })
    expect(parseImageUrl('dbimg://ygo/full/1.jpg')).toEqual({ source: 'ygo', size: 'full', id: '1' })
  })

  it('refuses anything that could escape the cache folder or reach another host', () => {
    for (const bad of ['dbimg://ygo/small/../../etc/passwd.jpg', 'dbimg://ygo/small/12a.jpg', 'dbimg://ygo/huge/12.jpg', 'dbimg://other/small/12.jpg', 'dbimg://ygo/small/12.png', 'dbimg://ygo/small/12.jpg?x=1', 'https://images.ygoprodeck.com/images/cards/12.jpg', 'dbimg://ygo/small/%2e%2e.jpg', 'dbimg://ygo/small/1234567890123.jpg', '']) {
      expect(parseImageUrl(bad), bad).toBeNull()
    }
  })

  it('maps a reference to the image host and to a file inside the cache', () => {
    const ref = parseImageUrl('dbimg://ygo/small/89631139.jpg')!
    expect(sourceUrl(ref)).toBe('https://images.ygoprodeck.com/images/cards_small/89631139.jpg')
    expect(sourceUrl({ ...ref, size: 'full' })).toBe('https://images.ygoprodeck.com/images/cards/89631139.jpg')
    expect(cacheFile('/cache', ref)).toBe(join('/cache', 'ygo', 'small', '89631139.jpg')) // backslashes on Windows
  })

  it('matches every image address the Yu-Gi-Oh! adapter produces', () => {
    const c = normalizeCard(RAW.normal)!
    expect(parseImageUrl(c.imageUrl!)).not.toBeNull()
    expect(parseImageUrl(c.imageUrlSmall!)).not.toBeNull()
  })
})

describe('scheduleSlot', () => {
  it('waits out the rest of the gap when called too soon after the last start', () => {
    expect(scheduleSlot(100, 20, 105)).toEqual({ waitMs: 15, nextLastStart: 120 })
  })

  it('does not wait, and starts from now, once the gap has already elapsed', () => {
    expect(scheduleSlot(100, 20, 130)).toEqual({ waitMs: -10, nextLastStart: 130 })
  })

  it('never lets two scheduled starts land less than minGapMs apart, across a whole sequence', () => {
    let lastStart = 0
    let now = 0
    const scheduled: number[] = []
    for (const elapsed of [0, 3, 1, 50, 0, 0, 22]) {
      now += elapsed
      const { nextLastStart } = scheduleSlot(lastStart, 20, now)
      scheduled.push(nextLastStart)
      lastStart = nextLastStart
    }
    const gaps = scheduled.slice(1).map((t, i) => t - scheduled[i])
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(20)
  })
})

describe('ImageFetcher', () => {
  const ref = parseImageUrl('dbimg://ygo/small/111.jpg')!
  const make = (fetchImpl: typeof fetch, extra = {}) => new ImageFetcher({ cacheDir: dir, fetchImpl, minGapMs: 0, retryDelayMs: 1, ...extra })

  it('downloads an image once, saves it, and serves it from disk afterwards', async () => {
    const fetchMock = vi.fn(async () => okImage())
    const fetcher = make(fetchMock as unknown as typeof fetch)
    expect([...(await fetcher.get(ref))]).toEqual([...JPEG])
    expect(existsSync(cacheFile(dir, ref))).toBe(true)
    expect([...(await fetcher.get(ref))]).toEqual([...JPEG])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // a brand-new fetcher (an app restart) reads the same file without touching the network
    const again = make((async () => { throw new Error('should not be called') }) as unknown as typeof fetch)
    expect([...(await again.get(ref))]).toEqual([...JPEG])
  })

  it('sends a User-Agent, and asks for the right address', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => okImage())
    await make(fetchMock as unknown as typeof fetch).get(ref)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://images.ygoprodeck.com/images/cards_small/111.jpg')
    const headers = (fetchMock.mock.calls[0][1] ?? {}).headers as Record<string, string>
    expect(headers['User-Agent']).toBe('Deckbuilder/1.0')
  })

  it('makes one request when many callers ask for the same image at once', async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return okImage()
    })
    const fetcher = make(fetchMock as unknown as typeof fetch)
    await Promise.all(Array.from({ length: 12 }, () => fetcher.get(ref)))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('caps how many downloads run at once', async () => {
    // The spacing rule itself (the flaky part under real timers) is unit-tested precisely and
    // instantly above, via scheduleSlot — this integration test sticks to what real timers can
    // check reliably: that the concurrency cap is actually enforced end to end.
    let running = 0
    let peak = 0
    const fetchMock = vi.fn(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 15))
      running--
      return okImage()
    })
    const fetcher = make(fetchMock as unknown as typeof fetch, { maxConcurrent: 3, minGapMs: 0 })
    const results = await Promise.all(Array.from({ length: 9 }, (_, i) => fetcher.get({ ...ref, id: String(1000 + i) })))
    expect(peak).toBeLessThanOrEqual(3)
    expect(results).toHaveLength(9)
  })

  it('retries a server error, and gives up on a missing image without retrying', async () => {
    const flaky = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(okImage())
    await expect(make(flaky as unknown as typeof fetch).get(ref)).resolves.toBeDefined()
    expect(flaky).toHaveBeenCalledTimes(3)

    const missing = vi.fn(async () => new Response('', { status: 404 }))
    await expect(make(missing as unknown as typeof fetch).get({ ...ref, id: '222' })).rejects.toThrow(/404/)
    expect(missing).toHaveBeenCalledTimes(1)
  })

  it('never caches a failure, or something that is not an image', async () => {
    const html = vi.fn(async () => new Response('<html>blocked</html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    await expect(make(html as unknown as typeof fetch, { attempts: 2 }).get({ ...ref, id: '333' })).rejects.toThrow()
    expect(existsSync(cacheFile(dir, { ...ref, id: '333' }))).toBe(false)
    const files = await readdir(join(dir, 'ygo', 'small')).catch(() => [])
    expect(files.filter((f) => f.endsWith('.tmp'))).toEqual([]) // no half-written leftovers
    const fixed = make((async () => okImage()) as unknown as typeof fetch)
    expect([...(await fixed.get({ ...ref, id: '333' }))]).toEqual([...JPEG]) // the next ask works
    expect([...(await readFile(cacheFile(dir, { ...ref, id: '333' })))]).toEqual([...JPEG])
  })
})
