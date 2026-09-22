import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncEngine, type SyncStatus, type SyncStore } from './engine'
import type { OutboxEntry } from './ops'
import type { SyncConfig } from './client'
import type { PulledState } from './ops'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const status = (code: number, body = '') => new Response(body, { status: code })

/** In-memory SyncStore for tests - mirrors what an IndexedDB or JSON-file-backed one would do,
 * without needing either. */
class FakeStore implements SyncStore {
  config: SyncConfig | null = { url: 'http://x', anonKey: 'anon', refreshToken: 'r0' }
  outbox: OutboxEntry[] = []
  rev = 0
  async getConfig() {
    return this.config
  }
  async setConfig(c: SyncConfig) {
    this.config = c
  }
  async clearConfig() {
    this.config = null
  }
  async getOutbox() {
    return this.outbox
  }
  async setOutbox(entries: OutboxEntry[]) {
    this.outbox = entries
  }
  async getRev() {
    return this.rev
  }
  async bumpRev() {
    return ++this.rev
  }
}

function makeEngine(store: FakeStore) {
  const pulls: PulledState[] = []
  const statuses: SyncStatus[] = []
  const engine = new SyncEngine(store, (s) => pulls.push(s), (s) => statuses.push(s))
  return { engine, pulls, statuses }
}

afterEach(() => vi.unstubAllGlobals())

describe('SyncEngine', () => {
  it('drains a queued op and empties the outbox on success', async () => {
    const store = new FakeStore()
    const fetchMock = vi.fn().mockResolvedValueOnce(ok({ access_token: 'tok', refresh_token: 'r1' })) // refresh
    fetchMock.mockResolvedValueOnce(ok(null)) // the deckbuilder_save_deck call itself
    fetchMock.mockResolvedValueOnce(ok({ decks: [], collection: [], wants: [] })) // the follow-up pull
    vi.stubGlobal('fetch', fetchMock)

    const { engine, pulls } = makeEngine(store)
    await engine.enqueue({ type: 'save_deck', id: 'd1', gameId: 'mtg', data: {} as never })
    await new Promise((r) => setTimeout(r, 0)) // let the enqueue-triggered tick's promises settle

    expect(store.outbox).toHaveLength(0)
    expect(pulls).toHaveLength(1)
    expect(store.config?.refreshToken).toBe('r1') // rotated token persisted
  })

  it('leaves a transient failure queued and reports offline instead of dropping it', async () => {
    const store = new FakeStore()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'tok', refresh_token: 'r0' }))
      .mockResolvedValueOnce(status(500, 'server exploded'))
    vi.stubGlobal('fetch', fetchMock)

    const { engine, statuses } = makeEngine(store)
    await engine.enqueue({ type: 'delete_deck', id: 'd1' })
    await new Promise((r) => setTimeout(r, 0))

    expect(store.outbox).toHaveLength(1) // still there
    expect(statuses.some((s) => s.state === 'offline')).toBe(true)
  })

  it('drops a permanently-rejected op instead of wedging the queue', async () => {
    const store = new FakeStore()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'tok', refresh_token: 'r0' }))
      .mockResolvedValueOnce(status(400, 'no such deck')) // not transient
      .mockResolvedValueOnce(ok({ decks: [], collection: [], wants: [] })) // pull still runs after
    vi.stubGlobal('fetch', fetchMock)

    const { engine } = makeEngine(store)
    await engine.enqueue({ type: 'delete_deck', id: 'gone-already' })
    await new Promise((r) => setTimeout(r, 0))

    expect(store.outbox).toHaveLength(0) // dropped, not stuck
  })

  it('processes two queued ops in order across ticks', async () => {
    const store = new FakeStore()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'tok', refresh_token: 'r0' })) // refresh (cached after)
      .mockResolvedValueOnce(ok(null)) // op 1
      .mockResolvedValueOnce(ok(null)) // op 2
      .mockResolvedValueOnce(ok({ decks: [], collection: [], wants: [] })) // pull
    vi.stubGlobal('fetch', fetchMock)

    const { engine } = makeEngine(store)
    await engine.enqueue({ type: 'delete_deck', id: 'a' })
    await engine.enqueue({ type: 'delete_deck', id: 'b' })
    await new Promise((r) => setTimeout(r, 0))

    expect(store.outbox).toHaveLength(0)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('applies a pull only when nothing local changed while it was in flight', async () => {
    const store = new FakeStore()
    let resolvePull!: (r: Response) => void
    const pullPromise = new Promise<Response>((r) => {
      resolvePull = r
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ access_token: 'tok', refresh_token: 'r0' })) // refresh for the pull
      .mockReturnValueOnce(pullPromise) // the pull itself, held open
    vi.stubGlobal('fetch', fetchMock)

    const { engine, pulls } = makeEngine(store)
    const startPromise = engine.start(1_000_000) // effectively only ticks once, manually
    // Wait until the pull's own fetch call is actually in flight (after the refresh call has
    // resolved) before simulating a local edit landing while it's held open - mutating rev
    // synchronously right after calling start() would run before any of its awaits have had a
    // chance to progress at all, since nothing here yields until a real async boundary is hit.
    while (fetchMock.mock.calls.length < 2) await Promise.resolve()
    store.rev = 99
    resolvePull(ok({ decks: [{ id: 'x', game_id: 'mtg', data: {} }], collection: [], wants: [] }))
    await startPromise
    await new Promise((r) => setTimeout(r, 0))

    expect(pulls).toHaveLength(0) // discarded, not applied over the newer local edit
    engine.stop()
  })

  it('reports offline instead of throwing when the refresh-token call itself fails', async () => {
    const store = new FakeStore()
    // Every fetch fails - simulates offline/DNS failure during token refresh, the thing that
    // actually failed uncaught before ensureAccessToken()'s callers wrapped it in try/catch.
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const { engine, statuses } = makeEngine(store)
    await engine.enqueue({ type: 'delete_deck', id: 'd1' })
    await new Promise((r) => setTimeout(r, 0))

    expect(statuses.some((s) => s.state === 'offline')).toBe(true)
    expect(store.outbox).toHaveLength(1) // untouched, not dropped
  })

  it('does nothing when disconnected (no config)', async () => {
    const store = new FakeStore()
    store.config = null
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { engine, statuses } = makeEngine(store)
    await engine.start(1_000_000)
    engine.stop()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(statuses).toEqual([{ state: 'disconnected' }])
  })
})
