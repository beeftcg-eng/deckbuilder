import { open, readFile, rename, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * Runs `task` after every earlier task queued under the same key has finished.
 * Every data file is a read-modify-write of one whole JSON document, so two
 * overlapping handlers would otherwise both read the same old contents and
 * the later write would silently drop the earlier one's change.
 */
const queues = new Map<string, Promise<unknown>>()

export function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.then(task)
  queues.set(
    key,
    run.catch(() => undefined),
  )
  return run
}

/**
 * Writes via a temp file + rename so a crash or full disk mid-write leaves the
 * previous file intact instead of a truncated one. The temp file is fsynced
 * before the rename so the new contents are on disk by the time it replaces
 * the old ones.
 */
export async function writeFileAtomic(path: string, data: string | Buffer, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  const handle = await open(tmp, 'w', mode)
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tmp, path)
}

export function writeJsonAtomic(path: string, value: unknown, mode?: number): Promise<void> {
  return writeFileAtomic(path, JSON.stringify(value, null, 2), mode)
}

function isMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as NodeJS.ErrnoException).code === 'ENOENT'
}

/**
 * Reads a JSON file, returning `fallback` if it doesn't exist. If it exists
 * but can't be parsed (or fails `validate`), the file is renamed aside to
 * `<name>.corrupt-<timestamp>` and `fallback` is returned — so the next save
 * can't overwrite whatever was salvageable in it. Other read errors (e.g.
 * permissions) are thrown rather than treated as "empty".
 */
export async function readJsonFile<T>(path: string, fallback: T, validate?: (value: unknown) => boolean): Promise<T> {
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (err) {
    if (isMissing(err)) return fallback
    throw err
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (validate && !validate(parsed)) throw new Error('unexpected JSON shape')
    return parsed as T
  } catch (err) {
    const aside = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
    console.error(`Couldn't read ${path} (${err instanceof Error ? err.message : String(err)}); moving it to ${aside}`)
    await rename(path, aside).catch(() => undefined)
    return fallback
  }
}

export function isPlainObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
