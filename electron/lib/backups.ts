import { mkdir, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { backupsDir, collectionFile, decksFile, wishlistFile } from './paths'
import { isPlainObject, readJsonFile, writeJsonAtomic } from './jsonStore'

export interface BackupBundle {
  version: 2
  exportedAt: string
  decks: unknown[]
  wishlist: unknown[]
  collection: Record<string, number>
}

/** Reads the three user-authored data files as they are on disk right now. */
export async function readBundle(): Promise<BackupBundle> {
  const [decks, wishlist, collection] = await Promise.all([
    readJsonFile<unknown[]>(decksFile(), [], Array.isArray),
    readJsonFile<unknown[]>(wishlistFile(), [], Array.isArray),
    readJsonFile<Record<string, number>>(collectionFile(), {}, isPlainObject),
  ])
  return { version: 2, exportedAt: new Date().toISOString(), decks, wishlist, collection }
}

export type SnapshotKind = 'auto' | 'pre-restore'

// How many of each kind to keep. Restores are rarer and more precious (they
// capture what a restore is about to overwrite), so they roll over slower.
const KEEP: Record<SnapshotKind, number> = { auto: 15, 'pre-restore': 10 }
const AUTO_INTERVAL_MS = 30 * 60 * 1000
const SNAPSHOT_NAME = /^(auto|pre-restore)-.+\.json$/

let lastSnapshotAt = 0

function fingerprint(bundle: Pick<BackupBundle, 'decks' | 'wishlist' | 'collection'>): string {
  return JSON.stringify({ decks: bundle.decks, wishlist: bundle.wishlist, collection: bundle.collection })
}

/**
 * Copies the current decks/wishlist/collection into the backups folder and
 * trims old snapshots. Skips writing when there's nothing to protect (so a
 * run of empty-data launches can't roll good snapshots out of the window) or
 * when the newest snapshot already matches. Returns the file name written.
 */
export async function snapshot(kind: SnapshotKind): Promise<string | null> {
  lastSnapshotAt = Date.now()
  const bundle = await readBundle()
  if (bundle.decks.length === 0 && bundle.wishlist.length === 0 && Object.keys(bundle.collection).length === 0) return null

  const dir = backupsDir()
  await mkdir(dir, { recursive: true })
  const existing = (await readdir(dir)).filter((name) => SNAPSHOT_NAME.test(name)).sort()

  const newest = existing.at(-1)
  if (newest) {
    try {
      const previous = JSON.parse(await readFile(join(dir, newest), 'utf-8')) as BackupBundle
      if (fingerprint(previous) === fingerprint(bundle)) return null
    } catch {
      // Unreadable newest snapshot: just write a fresh one.
    }
  }

  const name = `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  await writeJsonAtomic(join(dir, name), bundle)

  const ofKind = [...existing.filter((n) => n.startsWith(`${kind}-`)), name].sort()
  for (const stale of ofKind.slice(0, Math.max(0, ofKind.length - KEEP[kind]))) {
    await rm(join(dir, stale), { force: true })
  }
  return name
}

/**
 * Called just before a data file is overwritten: takes a snapshot of the
 * *previous* contents if the last one is over 30 minutes old. Never throws —
 * a failed backup must not block saving the user's edit.
 */
export async function maybeSnapshot(): Promise<void> {
  if (Date.now() - lastSnapshotAt < AUTO_INTERVAL_MS) return
  try {
    await snapshot('auto')
  } catch (err) {
    console.error('Auto-backup failed:', err)
  }
}
