import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonAtomic } from './jsonStore'

const state = vi.hoisted(() => ({ dir: '' }))
vi.mock('./paths', () => ({
  backupsDir: () => `${state.dir}/backups`,
  decksFile: () => `${state.dir}/decks.json`,
  bindersFile: () => `${state.dir}/binders.json`,
  wishlistFile: () => `${state.dir}/wishlist.json`,
  collectionFile: () => `${state.dir}/collection.json`,
}))

import { snapshot } from './backups'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const backupFiles = async () => (await readdir(join(state.dir, 'backups')).catch(() => [])).sort()

beforeEach(async () => {
  state.dir = await mkdtemp(join(tmpdir(), 'deckbuilder-backups-'))
})
afterEach(async () => {
  await rm(state.dir, { recursive: true, force: true })
})

describe('snapshot', () => {
  it('writes nothing when there is no data to protect', async () => {
    expect(await snapshot('auto')).toBeNull()
    expect(await backupFiles()).toEqual([])
  })

  it('writes a v3 bundle with decks, binders, wishlist and collection', async () => {
    await writeJsonAtomic(join(state.dir, 'decks.json'), [{ id: 'd1' }])
    await writeJsonAtomic(join(state.dir, 'binders.json'), [{ id: 'b1' }])
    await writeJsonAtomic(join(state.dir, 'collection.json'), { 'pokemon:x': 2 })
    const name = await snapshot('auto')
    expect(name).toMatch(/^auto-.*\.json$/)
    const saved = JSON.parse(await (await import('node:fs/promises')).readFile(join(state.dir, 'backups', name!), 'utf-8'))
    expect(saved).toMatchObject({ version: 3, decks: [{ id: 'd1' }], binders: [{ id: 'b1' }], wishlist: [], collection: { 'pokemon:x': 2 } })
  })

  it('protects data that only exists as a binder (no decks/wishlist/collection at all)', async () => {
    await writeJsonAtomic(join(state.dir, 'binders.json'), [{ id: 'b1' }])
    const name = await snapshot('auto')
    expect(name).not.toBeNull()
  })

  it('skips a snapshot identical to the newest one', async () => {
    await writeJsonAtomic(join(state.dir, 'decks.json'), [{ id: 'd1' }])
    expect(await snapshot('auto')).not.toBeNull()
    await sleep(3)
    expect(await snapshot('auto')).toBeNull()
    expect(await backupFiles()).toHaveLength(1)
  })

  it('keeps only the newest 15 automatic snapshots but leaves pre-restore ones alone', async () => {
    await writeJsonAtomic(join(state.dir, 'decks.json'), [{ id: 'keep-me' }])
    await snapshot('pre-restore')
    for (let i = 0; i < 18; i++) {
      await writeJsonAtomic(join(state.dir, 'decks.json'), [{ id: `d${i}` }])
      await sleep(3)
      await snapshot('auto')
    }
    const files = await backupFiles()
    expect(files.filter((f) => f.startsWith('auto-'))).toHaveLength(15)
    expect(files.filter((f) => f.startsWith('pre-restore-'))).toHaveLength(1)
  })
})
