import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpError, fetchJsonWithRetry, mapPool } from './fetchUtil'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const status = (code: number) => new Response('', { status: code })
const noWait = async () => {}
afterEach(() => vi.unstubAllGlobals())

describe('fetchJsonWithRetry', () => {
  it('retries 500s and dropped connections until one works', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(status(500)).mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(status(502)).mockResolvedValueOnce(ok({ fine: true }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchJsonWithRetry('http://x/a', { sleep: noWait })).resolves.toEqual({ fine: true })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('does not retry a 404 (it will not get better)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(404))
    vi.stubGlobal('fetch', fetchMock)
    const error = (await fetchJsonWithRetry('http://x/missing', { sleep: noWait }).catch((e: unknown) => e)) as HttpError
    expect(error).toBeInstanceOf(HttpError)
    expect(error.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up after the given attempts and reports the last failure, with waits that grow', async () => {
    const fetchMock = vi.fn().mockResolvedValue(status(500))
    vi.stubGlobal('fetch', fetchMock)
    const waits: number[] = []
    await expect(fetchJsonWithRetry('http://x/down', { attempts: 4, baseDelayMs: 1000, sleep: async (ms) => void waits.push(ms) })).rejects.toThrow(/500/)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(waits).toEqual([1000, 2000, 4000]) // no wait after the last try
  })

  it('retries 429 (rate limited)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(status(429)).mockResolvedValueOnce(ok([1])))
    await expect(fetchJsonWithRetry('http://x/r', { sleep: noWait })).resolves.toEqual([1])
  })
})

describe('mapPool', () => {
  it('keeps results in input order and never exceeds the limit', async () => {
    let running = 0
    let peak = 0
    const results = await mapPool([30, 5, 20, 1, 10, 2], 3, async (ms, i) => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, ms))
      running--
      return i * 10
    })
    expect(results).toEqual([0, 10, 20, 30, 40, 50])
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(1)
  })
  it('handles an empty list', async () => {
    expect(await mapPool([], 4, async () => 1)).toEqual([])
  })
})
