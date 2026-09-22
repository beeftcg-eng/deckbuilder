import { callRpc, isTransient, refreshAccessToken, type SyncConfig } from './client'
import { rpcForOp, type OutboxEntry, type PulledState, type SyncOp } from './ops'

/** Where the engine persists its state - one implementation over Node fs (Electron main) and one
 * over IndexedDB (the PWA). `rev` is a purely local monotonic counter, never sent to or read from
 * the server - see the "Real two-way sync" comment in supabase/schema.sql for why: a pull is only
 * ever applied if rev hasn't moved since the pull started, which is what stops a pull fetched
 * before a local edit landed from clobbering that edit. Mirrors Pawmodoro's storage.py `rev` /
 * `adopt_remote_state` exactly. */
export interface SyncStore {
  getConfig(): Promise<SyncConfig | null>
  setConfig(config: SyncConfig): Promise<void>
  clearConfig(): Promise<void>
  getOutbox(): Promise<OutboxEntry[]>
  setOutbox(entries: OutboxEntry[]): Promise<void>
  getRev(): Promise<number>
  bumpRev(): Promise<number>
}

export type SyncStatus =
  | { state: 'disconnected' }
  | { state: 'idle' }
  | { state: 'syncing' }
  | { state: 'offline'; message: string }

/** Runs the outbox drain + periodic pull loop. One instance per app; `onPulled` is called with a
 * PulledState only when it's actually safe to apply (rev unchanged, outbox empty at pull time) -
 * callers never see a stale pull and never need to re-check anything themselves. */
export class SyncEngine {
  private store: SyncStore
  private onPulled: (state: PulledState) => void
  private onStatus: (status: SyncStatus) => void
  private accessToken: string | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private draining = false

  constructor(store: SyncStore, onPulled: (state: PulledState) => void, onStatus: (status: SyncStatus) => void) {
    this.store = store
    this.onPulled = onPulled
    this.onStatus = onStatus
  }

  /** Call after connect/disconnect changes, or once at startup. */
  async start(intervalMs = 5000): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = setInterval(() => void this.tick(), intervalMs)
    await this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async enqueue(op: SyncOp): Promise<void> {
    const outbox = await this.store.getOutbox()
    outbox.push({ id: crypto.randomUUID(), op })
    await this.store.setOutbox(outbox)
    await this.store.bumpRev()
    void this.tick()
  }

  private async ensureAccessToken(): Promise<{ config: SyncConfig; accessToken: string } | null> {
    const config = await this.store.getConfig()
    if (!config) return null
    if (this.accessToken) return { config, accessToken: this.accessToken }
    const { accessToken, refreshToken } = await refreshAccessToken(config)
    this.accessToken = accessToken
    if (refreshToken !== config.refreshToken) await this.store.setConfig({ ...config, refreshToken })
    return { config: { ...config, refreshToken }, accessToken }
  }

  private async tick(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      const config = await this.store.getConfig()
      if (!config) {
        this.onStatus({ state: 'disconnected' })
        return
      }
      const drained = await this.drain()
      if (!drained) return // left mid-queue on a transient failure; try again next tick
      await this.pull()
      this.onStatus({ state: 'idle' })
    } catch (err) {
      // Last-resort net: drain()/pull() handle their own known failure modes, but this runs
      // from a bare `setInterval` callback (see start()) with nothing else to catch a surprise
      // throw - one would otherwise become an unhandled promise rejection instead of a status update.
      this.onStatus({ state: 'offline', message: err instanceof Error ? err.message : String(err) })
    } finally {
      this.draining = false
    }
  }

  /** Returns true once the outbox is fully empty (or was already empty), false if it stopped on a
   * transient failure partway through. */
  private async drain(): Promise<boolean> {
    for (;;) {
      const outbox = await this.store.getOutbox()
      if (outbox.length === 0) return true
      const entry = outbox[0]
      let auth: { config: SyncConfig; accessToken: string } | null
      try {
        auth = await this.ensureAccessToken()
      } catch (err) {
        // A dead refresh token or network failure - not this op's fault, and not safe to drop.
        this.onStatus({ state: 'offline', message: err instanceof Error ? err.message : String(err) })
        return false
      }
      if (!auth) return true // disconnected mid-loop; nothing more to do
      const { name, params } = rpcForOp(entry.op)
      try {
        await callRpc(auth.config, auth.accessToken, name, params)
      } catch (err) {
        if (err instanceof Error && err.message.includes('401')) this.accessToken = null // force a fresh token next try
        if (isTransient(err)) {
          this.onStatus({ state: 'offline', message: err instanceof Error ? err.message : String(err) })
          return false
        }
        // The server rejected the request itself (e.g. a since-deleted deck) - drop it so it can't wedge the queue.
      }
      const remaining = (await this.store.getOutbox()).filter((e) => e.id !== entry.id)
      await this.store.setOutbox(remaining)
      await this.store.bumpRev()
    }
  }

  private async pull(): Promise<void> {
    const revBefore = await this.store.getRev()
    let auth: { config: SyncConfig; accessToken: string } | null
    try {
      auth = await this.ensureAccessToken()
    } catch (err) {
      this.onStatus({ state: 'offline', message: err instanceof Error ? err.message : String(err) })
      return
    }
    if (!auth) return
    let result: PulledState
    try {
      result = (await callRpc(auth.config, auth.accessToken, 'deckbuilder_sync_pull', {})) as PulledState
    } catch (err) {
      if (err instanceof Error && err.message.includes('401')) this.accessToken = null
      this.onStatus({ state: 'offline', message: err instanceof Error ? err.message : String(err) })
      return
    }
    const outbox = await this.store.getOutbox()
    const revAfter = await this.store.getRev()
    if (revAfter !== revBefore || outbox.length > 0) return // something local changed mid-pull; discard it, next tick tries again
    this.onPulled(result)
  }
}
