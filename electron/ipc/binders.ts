import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Binder } from '../../src/shared/types'
import { readBinders, withDataLock, writeBinders } from '../lib/dataFiles'
import { enqueueSyncOp } from './deckbuilderSync'

export function registerBindersIpc(): void {
  ipcMain.handle('binders:list', (): Promise<Binder[]> => withDataLock(readBinders))

  // Every save carries the whole binder, and the renderer applies edits optimistically, so saves
  // must be applied one at a time in the order they arrive (withDataLock) - see decks.ts's save.
  ipcMain.handle('binders:save', (_e, binder: Binder): Promise<Binder> =>
    withDataLock(async () => {
      const binders = await readBinders()
      const now = new Date().toISOString()
      const index = binders.findIndex((b) => b.id === binder.id)

      if (index === -1) {
        const created: Binder = { ...binder, id: binder.id || randomUUID(), createdAt: binder.createdAt || now, updatedAt: now }
        binders.push(created)
        await writeBinders(binders)
        enqueueSyncOp({ type: 'save_binder', id: created.id, data: created })
        return created
      }

      const updated: Binder = { ...binder, createdAt: binders[index].createdAt, updatedAt: now }
      binders[index] = updated
      await writeBinders(binders)
      enqueueSyncOp({ type: 'save_binder', id: updated.id, data: updated })
      return updated
    }),
  )

  ipcMain.handle('binders:delete', (_e, binderId: string): Promise<void> =>
    withDataLock(async () => {
      const binders = await readBinders()
      await writeBinders(binders.filter((b) => b.id !== binderId))
      enqueueSyncOp({ type: 'delete_binder', id: binderId })
    }),
  )
}
