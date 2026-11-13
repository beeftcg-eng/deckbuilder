/**
 * Publishes <out>/banlists.json, the ban lists every app reads at launch (src/shared/banLists.ts):
 *
 * - One Piece and Riftbound: each format's lists exactly as kept in this repo (the adapters'
 *   defaultFormats). Changing them there and pushing is how a new official list reaches everyone.
 * - Yu-Gi-Oh!: the TCG, OCG and GOAT Forbidden / Limited / Semi-Limited lists from YGOPRODeck.
 *
 * Run by .github/workflows/deploy-pwa.yml (daily and on every push):
 *
 *   npx rolldown scripts/build-ban-lists.ts --platform node --format esm -o .banlists/build-ban-lists.mjs
 *   node .banlists/build-ban-lists.mjs dist-web
 *
 * When YGOPRODeck can't be read, the file is still written without Yu-Gi-Oh! (apps then keep the
 * list they have), and it exits non-zero so the daily source check (check-sources) notices.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { onepieceAdapter } from '../src/shared/games/onepiece.ts'
import { riftboundAdapter } from '../src/shared/games/riftbound.ts'
import { YGO_FORMAT_IDS } from '../src/shared/games/yugioh.ts'
import { publishedFormatOf, type BanListsFile, type BanStatus, type PublishedFormat, type YgoBanList } from '../src/shared/banLists.ts'

const YGO_STATUS: Record<string, BanStatus> = { Forbidden: 'banned', Limited: 'restricted', 'Semi-Limited': 'semi-restricted' }
/** Fewer than this on a list means the API answered with something other than the list. */
const MIN_YGO_LIST = { tcg: 50, ocg: 50, goat: 20 } as const

async function ygoList(formatId: (typeof YGO_FORMAT_IDS)[number]): Promise<YgoBanList> {
  const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?banlist=${formatId}`
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'BeefsBrewhouse (ban lists; daily)', Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json()) as { data?: { id: number; name: string; banlist_info?: Record<string, string> }[] }
      const list: YgoBanList = { cards: {}, names: {} }
      for (const card of body.data ?? []) {
        const status = YGO_STATUS[card.banlist_info?.[`ban_${formatId}`] ?? '']
        if (!status) continue
        list.cards[String(card.id)] = status
        list.names[String(card.id)] = card.name
      }
      const n = Object.keys(list.cards).length
      if (n < MIN_YGO_LIST[formatId]) throw new Error(`only ${n} cards on the list`)
      return list
    } catch (err) {
      lastError = err
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
  throw new Error(`YGOPRODeck ${formatId} list: ${lastError instanceof Error ? lastError.message : lastError}`)
}

async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('Usage: build-ban-lists <out dir>')
  const repoFormats = (formats: typeof onepieceAdapter.defaultFormats): Record<string, PublishedFormat> =>
    Object.fromEntries(formats.map((f) => [f.id, publishedFormatOf(f)]))
  const file: BanListsFile = {
    updatedAt: new Date().toISOString(),
    formats: { onepiece: repoFormats(onepieceAdapter.defaultFormats), riftbound: repoFormats(riftboundAdapter.defaultFormats) },
  }
  let failed: string | null = null
  try {
    const yugioh: Record<string, YgoBanList> = {}
    for (const id of YGO_FORMAT_IDS) yugioh[id] = await ygoList(id)
    file.yugioh = yugioh
  } catch (err) {
    failed = err instanceof Error ? err.message : String(err)
  }
  await mkdir(out, { recursive: true })
  await writeFile(join(out, 'banlists.json'), JSON.stringify(file))
  const ygo = file.yugioh ? YGO_FORMAT_IDS.map((id) => `${id} ${Object.keys(file.yugioh![id].cards).length}`).join(', ') : 'left out'
  console.log(`Ban lists: One Piece and Riftbound from the repo; Yu-Gi-Oh! ${ygo}`)
  if (failed) {
    console.error('Ban lists: Yu-Gi-Oh! failed:', failed)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Ban lists failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
