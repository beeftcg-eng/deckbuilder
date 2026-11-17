/**
 * Rebuilds the Riftbound card backup (src/shared/games/riftbound.ts, BACKUP_URL) from riftcodex and writes it
 * to <out>/riftbound.json. Run by .github/workflows/deploy-pwa.yml with every deploy (and daily), so the backup
 * is never more than a day behind while riftcodex is up.
 *
 *   npx rolldown scripts/build-card-backup.ts --platform node --format esm -o .card-backup/build-card-backup.mjs
 *   node .card-backup/build-card-backup.mjs .card-backup/out
 *
 * Writes nothing and exits non-zero when riftcodex can't be read, or answers with far fewer cards than the
 * backup already has (a half-broken API mustn't replace a good backup). The workflow then keeps the last
 * published file.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BACKUP_URL, fetchRiftcodexCatalog } from '../src/shared/games/riftbound.ts'
import type { Card } from '../src/shared/types.ts'

/** Fewer than this many cards is never a real Riftbound card list. */
const MIN_CARDS = 500
/** And it may not shrink by more than this against the published backup (cards are only ever added). */
const MAX_SHRINK = 0.1

async function publishedCount(): Promise<number | null> {
  try {
    const res = await fetch(BACKUP_URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const file = (await res.json()) as { cards?: Card[] }
    return Array.isArray(file.cards) ? file.cards.length : null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const out = process.argv[2]
  if (!out) throw new Error('Usage: build-card-backup.mjs <out dir>')
  const cards = await fetchRiftcodexCatalog(() => {})
  const before = await publishedCount()
  if (cards.length < MIN_CARDS) throw new Error(`riftcodex gave only ${cards.length} cards`)
  if (before && cards.length < before * (1 - MAX_SHRINK)) throw new Error(`riftcodex gave ${cards.length} cards; the backup has ${before}`)
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'riftbound.json'), JSON.stringify({ builtAt: new Date().toISOString(), cards }))
  console.log(`Riftbound card backup: ${cards.length} cards (was ${before ?? 'unknown'})`)
}

main().catch((err) => {
  console.error('Riftbound card backup not rebuilt:', err instanceof Error ? err.message : err)
  process.exit(1)
})
