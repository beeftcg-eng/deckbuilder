import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetServerVersion, missingUpdates, serverVersion } from './serverVersion'

afterEach(() => {
  vi.unstubAllGlobals()
  forgetServerVersion()
})

describe('the server version', () => {
  it('is 0 before the numbered updates, and lists what to run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await serverVersion()).toBe(0)
    expect(missingUpdates(0, 3).map((u) => u.version)).toEqual([1, 2, 3])
    expect(missingUpdates(3, 3)).toEqual([])
    expect(missingUpdates(null, 3)).toEqual([])
  })

  it('reads the number, once', async () => {
    const fetch = vi.fn(async () => new Response('3', { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    expect(await serverVersion()).toBe(3)
    expect(await serverVersion()).toBe(3)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
