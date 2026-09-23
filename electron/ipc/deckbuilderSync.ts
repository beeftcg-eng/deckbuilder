import { BrowserWindow, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Binder, Collection, Deck, GameId, WishlistEntry } from '../../src/shared/types'
import { SyncEngine, type SyncStatus } from '../../src/shared/sync/engine'
import type { PulledState, SyncOp } from '../../src/shared/sync/ops'
import { NodeSyncStore } from '../lib/nodeSyncStore'
import { cardsCacheDir } from '../lib/paths'
import { readForTrade, readWishlist, withDataLock, writeBinders, writeCollection, writeDecks, writeForTrade, writeWishlist } from '../lib/dataFiles'

const store = new NodeSyncStore()
let engine: SyncEngine | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

async function applyPulledState(state: PulledState): Promise<void> {
  await withDataLock(async () => {
    const decks: Deck[] = state.decks.map((d) => ({ ...d.data, id: d.id, gameId: d.game_id as GameId }))
    await writeDecks(decks)

    // A pull against a not-yet-redeployed schema (before deckbuilder_binders existed server-side)
    // omits this key entirely rather than sending an empty array - tolerate that transitional
    // shape instead of crashing, same as an old client talking to a newer schema already does.
    const binders: Binder[] = (state.binders ?? []).map((b) => ({ ...b.data, id: b.id }))
    await writeBinders(binders)

    const collection: Collection = {}
    const forTrade: string[] = []
    for (const row of state.collection) {
      collection[row.card_id] = row.quantity
      if (row.for_trade) forTrade.push(row.card_id)
    }
    await writeCollection(collection)
    const previousForTrade = await readForTrade()
    if (JSON.stringify([...previousForTrade].sort()) !== JSON.stringify([...forTrade].sort())) await writeForTrade(forTrade)

    // Pushed-to-Pawmodoro state (pushedTaskId) is desktop/session-local and the server never sees
    // it - carry it across the same way Pawmodoro's own _apply_remote_state preserves local-only
    // fields across a full-state replace, or a phone-added wishlist item would wipe a desktop
    // push's record of already existing on the checklist.
    const previousWishlist = await readWishlist()
    const previousByKey = new Map(previousWishlist.map((e) => [`${e.gameId}:${e.cardId}`, e]))
    const wishlist: WishlistEntry[] = state.wants.map((w) => {
      const key = `${w.game_id}:${w.card_id}`
      const previous = previousByKey.get(key)
      return {
        id: previous?.id ?? w.card_id,
        gameId: w.game_id as GameId,
        cardId: w.card_id,
        quantity: w.quantity,
        addedAt: previous?.addedAt ?? new Date().toISOString(),
        pushedTaskId: previous?.pushedTaskId ?? null,
      }
    })
    await writeWishlist(wishlist)
  })
  broadcast('deckbuilderSync:pulled', undefined)
}

function ensureEngine(): SyncEngine {
  if (!engine) {
    engine = new SyncEngine(
      store,
      (state) => void applyPulledState(state),
      (status: SyncStatus) => broadcast('deckbuilderSync:status', status),
    )
    void engine.start()
  }
  return engine
}

export function enqueueSyncOp(op: SyncOp): void {
  void ensureEngine().enqueue(op)
}

/** Called by pawmodoro.ts after connect/disconnect - starting/stopping the engine happens lazily
 * on the next enqueue/tick either way, so this just needs to exist and not throw synchronously. */
export function notifyPawmodoroConnectionChanged(): void {
  ensureEngine()
}

/** Card name/set code for a collection/wishlist sync op, read from the same per-game cache file
 * cards:sync writes - the main process has no in-memory catalog the way the renderer's Zustand
 * store does. */
export async function lookupCardNameAndSet(cardId: string): Promise<{ name: string; setCode: string; gameId: string }> {
  const gameId = cardId.split(':')[0]
  try {
    const raw = await readFile(join(cardsCacheDir(), `${gameId}.json`), 'utf-8')
    const cache = JSON.parse(raw) as { cards: { id: string; name: string; setCode: string }[] }
    const card = cache.cards.find((c) => c.id === cardId)
    return { name: card?.name ?? cardId, setCode: card?.setCode ?? '', gameId }
  } catch {
    return { name: cardId, setCode: '', gameId }
  }
}

export function registerDeckbuilderSyncIpc(): void {
  ipcMain.handle('deckbuilderSync:status', async (): Promise<SyncStatus> => ({ state: 'idle' }))
  // Start eagerly if already connected, so a pull can happen even before any local edit enqueues anything.
  void store.getConfig().then((config) => config && ensureEngine())
}
