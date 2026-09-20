import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPlainObject, readJsonFile, withLock, writeJsonAtomic } from './jsonStore'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'deckbuilder-test-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('writeJsonAtomic', () => {
  it('writes the file and leaves no temp file behind', async () => {
    const path = join(dir, 'decks.json')
    await writeJsonAtomic(path, [{ id: 1 }])
    expect(JSON.parse(await readFile(path, 'utf-8'))).toEqual([{ id: 1 }])
    expect(await readdir(dir)).toEqual(['decks.json'])
  })

  it('creates missing parent folders and can set a file mode', async () => {
    const path = join(dir, 'nested', 'deeper', 'a.json')
    await writeJsonAtomic(path, { ok: true }, 0o600)
    expect(JSON.parse(await readFile(path, 'utf-8'))).toEqual({ ok: true })
  })
})

describe('readJsonFile', () => {
  it('returns the fallback for a missing file without creating anything', async () => {
    expect(await readJsonFile(join(dir, 'nope.json'), [])).toEqual([])
    expect(await readdir(dir)).toEqual([])
  })

  it('moves an unparseable file aside instead of letting it be overwritten', async () => {
    const path = join(dir, 'decks.json')
    await writeFile(path, '[{"id": "half-writ')
    expect(await readJsonFile(path, [], Array.isArray)).toEqual([])

    const files = await readdir(dir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^decks\.json\.corrupt-/)
    expect(await readFile(join(dir, files[0]), 'utf-8')).toBe('[{"id": "half-writ')
  })

  it('treats valid JSON of the wrong shape as corrupt too', async () => {
    const path = join(dir, 'collection.json')
    await writeFile(path, '[1,2,3]')
    expect(await readJsonFile(path, {}, isPlainObject)).toEqual({})
    expect((await readdir(dir))[0]).toMatch(/^collection\.json\.corrupt-/)
  })
})

describe('withLock', () => {
  it('runs tasks for one key strictly in order even when an earlier one is slower', async () => {
    const order: string[] = []
    const slow = withLock('k', async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push('slow')
    })
    const fast = withLock('k', async () => {
      order.push('fast')
    })
    await Promise.all([slow, fast])
    expect(order).toEqual(['slow', 'fast'])
  })

  it('keeps going after a task fails, and still reports that failure to its caller', async () => {
    const failing = withLock('k2', async () => {
      throw new Error('boom')
    })
    const after = withLock('k2', async () => 'ran')
    await expect(failing).rejects.toThrow('boom')
    await expect(after).resolves.toBe('ran')
  })

  it('does not lose read-modify-write updates that overlap', async () => {
    const path = join(dir, 'counter.json')
    await writeJsonAtomic(path, { n: 0 })
    const bump = () =>
      withLock('counter', async () => {
        const { n } = await readJsonFile<{ n: number }>(path, { n: 0 })
        await new Promise((r) => setTimeout(r, 5))
        await writeJsonAtomic(path, { n: n + 1 })
      })
    await Promise.all(Array.from({ length: 10 }, bump))
    expect((await readJsonFile<{ n: number }>(path, { n: 0 })).n).toBe(10)
  })
})
