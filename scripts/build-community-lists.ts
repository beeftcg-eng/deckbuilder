/**
 * Collects the Community lists every app reads (src/shared/communityGames.ts) and writes them to
 * <out>/<game>.json: Riftbound's from RiftAtlas (its Decks page and each recent event's page), One
 * Piece's and Pokémon's from the Limitless API (src/shared/limitless.ts). Neither lets the phone app
 * read it directly (RiftAtlas blocks other pages; Limitless allows 50 requests in 5 minutes). Run by
 * .github/workflows/deploy-pwa.yml when the phone app is deployed (and daily).
 *
 *   npx rolldown scripts/build-community-lists.ts --platform node --format esm -o .community/build-community-lists.mjs
 *   node .community/build-community-lists.mjs dist-web/community
 *
 * It's also the check that the sources can still be read: each game is written or not on its own, and it
 * exits non-zero when any couldn't be (too few lists, or Riftbound deck codes that don't decode). The
 * workflow then re-publishes the last good file for each game that's missing, and the daily source
 * check (scripts/check-sources.ts) opens an issue.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { collectCommunityLists } from '../src/shared/communityLists.ts'
import { decodeDeckCode } from '../src/shared/riftboundDeckCode.ts'
import { LIMITLESS_API, collectLimitlessLists, type LimitlessGame } from '../src/shared/limitless.ts'
import { recordHealth } from './health.ts'

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

/** Fewer Limitless lists than this means the API answered with something else. */
const MIN_LIMITLESS_LISTS = 30
/** Limitless allows 50 requests in 5 minutes: spaced out, both games fit in one window. */
const LIMITLESS_GAP_MS = 1500

async function limitlessJson(path: string): Promise<unknown> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    await new Promise((r) => setTimeout(r, LIMITLESS_GAP_MS))
    try {
      const res = await fetch(LIMITLESS_API + path, { headers: { 'User-Agent': 'BeefsBrewhouse (community lists; daily)', Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) })
      if (res.status === 429) {
        // Over the limit: wait for the window to pass.
        await new Promise((r) => setTimeout(r, 60_000))
        throw new Error('rate limited')
      }
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
      const body = await res.text()
      if (body.length > MAX_BYTES * 4) throw new Error(`${path}: too large`)
      return JSON.parse(body)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function riftbound(out: string): Promise<string> {
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
  await writeFile(join(out, 'riftbound.json'), JSON.stringify(file))
  return `${file.lists.length} lists from ${new Set(file.lists.map((l) => l.eventId)).size} events (${unreadable.length} unreadable codes left in)`
}

async function limitless(out: string, game: LimitlessGame): Promise<string> {
  const file = await collectLimitlessLists(game, limitlessJson)
  if (file.lists.length < MIN_LIMITLESS_LISTS) throw new Error(`Only ${file.lists.length} lists: Limitless's API has probably changed`)
  await writeFile(join(out, `${game}.json`), JSON.stringify(file))
  return `${file.lists.length} lists from ${new Set(file.lists.map((l) => l.eventId)).size} events`
}

async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('Usage: build-community-lists <out dir>')
  await mkdir(out, { recursive: true })
  const failed: string[] = []
  for (const [name, run] of [
    ['Riftbound (RiftAtlas)', () => riftbound(out)],
    ['One Piece (Limitless)', () => limitless(out, 'onepiece')],
    ['Pokémon (Limitless)', () => limitless(out, 'pokemon')],
  ] as const) {
    const source = `Community lists: ${name}`
    try {
      console.log(`${source}: ${await run()}`)
      await recordHealth(process.env.HEALTH_DIR, { source, ok: true, detail: '' })
    } catch (err) {
      failed.push(name)
      const detail = err instanceof Error ? err.message : String(err)
      console.error(`${source} failed:`, detail)
      await recordHealth(process.env.HEALTH_DIR, { source, ok: false, detail })
    }
  }
  if (failed.length) throw new Error(`couldn't read ${failed.join(', ')}`)
}

main().catch((err) => {
  console.error('Community lists failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
