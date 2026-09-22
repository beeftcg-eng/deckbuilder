import type { SyncStore } from '../../src/shared/sync/engine'
import type { OutboxEntry } from '../../src/shared/sync/ops'
import type { SyncConfig } from '../../src/shared/sync/client'
import { readPawmodoroConfig, writePawmodoroConfig, clearPawmodoroConfig } from './pawmodoroConfig'
import { syncStateFile } from './paths'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from './jsonStore'

interface SyncState {
  rev: number
  outbox: OutboxEntry[]
}

const isSyncState = (v: unknown): v is SyncState => isPlainObject(v) && Array.isArray((v as SyncState).outbox)

async function readState(): Promise<SyncState> {
  return readJsonFile<SyncState>(syncStateFile(), { rev: 0, outbox: [] }, isSyncState)
}

/** SyncEngine's persistence for the desktop app - config is the same file pawmodoro.ts's
 * connect/disconnect already manage (one account connection powers both wishlist push/trading
 * and this app's own decks/collection/wishlist sync), everything else lives in sync-state.json. */
export class NodeSyncStore implements SyncStore {
  async getConfig(): Promise<SyncConfig | null> {
    const config = await readPawmodoroConfig()
    return config ? { url: config.url, anonKey: config.anonKey, refreshToken: config.refreshToken, email: config.email } : null
  }
  async setConfig(config: SyncConfig): Promise<void> {
    await writePawmodoroConfig({ url: config.url, anonKey: config.anonKey, refreshToken: config.refreshToken, email: config.email ?? '' })
  }
  async clearConfig(): Promise<void> {
    await clearPawmodoroConfig()
  }
  async getOutbox(): Promise<OutboxEntry[]> {
    return (await readState()).outbox
  }
  async setOutbox(entries: OutboxEntry[]): Promise<void> {
    return withLock('sync-state', async () => {
      const state = await readState()
      await writeJsonAtomic(syncStateFile(), { ...state, outbox: entries })
    })
  }
  async getRev(): Promise<number> {
    return (await readState()).rev
  }
  async bumpRev(): Promise<number> {
    return withLock('sync-state', async () => {
      const state = await readState()
      const next = state.rev + 1
      await writeJsonAtomic(syncStateFile(), { ...state, rev: next })
      return next
    })
  }
}
