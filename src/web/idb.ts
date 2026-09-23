/**
 * A minimal, hand-rolled IndexedDB wrapper - no new dependency, matching this codebase's existing
 * low-dependency approach (e.g. supabase_sync.py's own "stdlib only" choice on the Pawmodoro side).
 * One database, one object store per data type, each row keyed by its own natural key (a card id,
 * a deck id, etc.) or a single fixed key for singleton values (config, rev).
 */

const DB_NAME = 'deckbuilder'
// Bumped for the 'binders' store - onupgradeneeded only fires on a version increase, so an
// existing database (version 1) needs this bump to ever get the new object store created.
const DB_VERSION = 2

export const STORES = ['decks', 'binders', 'collection', 'forTrade', 'wishlist', 'formats', 'settings', 'sync', 'cards'] as const
export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return promisify(db.transaction(store, 'readonly').objectStore(store).get(key))
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  return promisify(db.transaction(store, 'readonly').objectStore(store).getAll())
}

export async function idbSet<T>(store: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const db = await openDb()
  await promisify(db.transaction(store, 'readwrite').objectStore(store).put(value, key))
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  await promisify(db.transaction(store, 'readwrite').objectStore(store).delete(key))
}

export async function idbClear(store: StoreName): Promise<void> {
  const db = await openDb()
  await promisify(db.transaction(store, 'readwrite').objectStore(store).clear())
}

/** Replaces the store's entire contents in one transaction - for a full local replace after a
 * successful sync pull (mirrors Pawmodoro's `_apply_remote_state` doing a full-array swap). */
export async function idbReplaceAll<T>(store: StoreName, entries: [IDBValidKey, T][]): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(store, 'readwrite')
  const os = tx.objectStore(store)
  os.clear()
  for (const [key, value] of entries) os.put(value, key)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
