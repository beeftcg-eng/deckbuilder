/**
 * How each outside source did in today's deploy, for scripts/check-sources.ts: one small JSON file per
 * source in the health directory (the deploy passes it as HEALTH_DIR). Writing one is best effort: a
 * script run by hand without HEALTH_DIR just doesn't record anything.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface HealthRow {
  source: string
  ok: boolean
  /** What went wrong, for the issue. Empty when ok. */
  detail: string
}

const fileName = (source: string) => `${source.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`

export async function recordHealth(dir: string | undefined, row: HealthRow): Promise<void> {
  if (!dir) return
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, fileName(row.source)), JSON.stringify(row))
  } catch (err) {
    console.warn('Could not record source health:', err instanceof Error ? err.message : err)
  }
}
