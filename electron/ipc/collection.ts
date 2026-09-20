import { ipcMain } from 'electron'
import type { Collection } from '../../src/shared/types'
import { readCollection, withDataLock, writeCollection } from '../lib/dataFiles'

const MAX_OWNED = 999

function clampQuantity(quantity: number): number {
  return Math.min(MAX_OWNED, Math.max(0, Math.floor(Number(quantity) || 0)))
}

export function registerCollectionIpc(): void {
  ipcMain.handle('collection:get', (): Promise<Collection> => withDataLock(readCollection))

  // Adds copies on top of what's already owned; a negative quantity removes copies (never below 0, and
  // 0 drops the entry). Relative on purpose: the +/− steppers send ±1, so two quick clicks both count.
  ipcMain.handle('collection:add', (_e, items: { cardId: string; quantity: number }[]): Promise<Collection> =>
    withDataLock(async () => {
      const collection = await readCollection()
      for (const { cardId, quantity } of items) {
        const next = clampQuantity((collection[cardId] ?? 0) + quantity)
        if (next === 0) delete collection[cardId]
        else collection[cardId] = next
      }
      await writeCollection(collection)
      return collection
    }),
  )
}
