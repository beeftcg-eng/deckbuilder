/**
 * Collects RiftAtlas's Riftbound tournament lists (its Decks page and each recent event's page) and
 * writes them to <out>/riftbound.json, for every app to read (src/shared/communityLists.ts): RiftAtlas
 * doesn't let a web page read it, so the phone app can't go there itself. Run by
 * .github/workflows/deploy-pwa.yml when the phone app is deployed (and daily).
 *
 *   npx rolldown scripts/build-community-lists.ts --platform node --format esm -o .community/build-community-lists.mjs
 *   node .community/build-community-lists.mjs dist-web/community
 *
 * It's also the check that RiftAtlas can still be read: it exits non-zero when the pages can't be read
 * or come back with too few lists, or lists whose deck codes don't decode, and the workflow then opens
 * an issue and re-publishes the last good file.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { collectCommunityLists } from '../src/shared/communityLists.ts'
import { decodeDeckCode } from '../src/shared/riftboundDeckCode.ts'

const MIN_LISTS = 20
const MAX_BYTES = 5 * 1024 * 1024

async function fetchPage(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'BeefsBrewhouse (community lists; daily)' }, signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      const body = await res.text()
      if (body.length > MAX_BYTES) throw new Error(`${url}: too large`)
      return body
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw lastError
}

async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('Usage: build-community-lists <out dir>')
  const file = await collectCommunityLists(fetchPage)
  const unreadable = file.lists.filter((l) => {
    try {
      decodeDeckCode(l.deckCode)
      return false
    } catch {
      return true
    }
  })
  if (file.lists.length < MIN_LISTS) throw new Error(`Only ${file.lists.length} lists: RiftAtlas's pages have probably changed`)
  if (unreadable.length > file.lists.length * 0.05) throw new Error(`${unreadable.length} of ${file.lists.length} deck codes don't decode: the deck code format has probably changed`)
  const events = new Set(file.lists.map((l) => l.eventId)).size
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'riftbound.json'), JSON.stringify(file))
  console.log(`Community lists: ${file.lists.length} lists from ${events} events (${unreadable.length} unreadable codes left in)`)
}

main().catch((err) => {
  console.error('Community lists failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
