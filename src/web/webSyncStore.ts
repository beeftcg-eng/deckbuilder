import type { SyncStore } from '../shared/sync/engine'
import type { OutboxEntry } from '../shared/sync/ops'
import type { SyncConfig } from '../shared/sync/client'
import { idbGet, idbSet } from './idb'

const CONFIG_KEY = 'config'
const OUTBOX_KEY = 'outbox'
const REV_KEY = 'rev'

/** SyncEngine's persistence, backed by the `sync` IndexedDB store's few singleton keys. */
export class WebSyncStore implements SyncStore {
  async getConfig(): Promise<SyncConfig | null> {
    return (await idbGet<SyncConfig>('sync', CONFIG_KEY)) ?? null
  }
  async setConfig(config: SyncConfig): Promise<void> {
    await idbSet('sync', CONFIG_KEY, config)
  }
  async clearConfig(): Promise<void> {
    await idbSet('sync', CONFIG_KEY, null)
  }
  async getOutbox(): Promise<OutboxEntry[]> {
    return (await idbGet<OutboxEntry[]>('sync', OUTBOX_KEY)) ?? []
  }
  async setOutbox(entries: OutboxEntry[]): Promise<void> {
    await idbSet('sync', OUTBOX_KEY, entries)
  }
  async getRev(): Promise<number> {
    return (await idbGet<number>('sync', REV_KEY)) ?? 0
  }
  async bumpRev(): Promise<number> {
    const next = (await this.getRev()) + 1
    await idbSet('sync', REV_KEY, next)
    return next
  }
}
