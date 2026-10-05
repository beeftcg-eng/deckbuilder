/**
 * Lists the cards a game's sync ends up with no picture for, by set, most valuable first, so gaps
 * (a new set's promos, printings only TCGplayer lists) show up without hunting for them in the app.
 * It runs the app's own download code, so it sees exactly what a sync does - for Riftbound that's
 * riftcodex plus the printings the phone app's site publishes (riftboundExtras.ts).
 *
 *   npx rolldown scripts/missing-art.ts --platform node --format esm -o .prices/missing-art.mjs
 *   node .prices/missing-art.mjs [game ...] [--markdown]
 *
 * Run it from your own machine: riftcodex answers 403 to GitHub Actions' runners, so it can't run in the
 * daily deploy. --markdown prints a table for pasting. Pictures to fill a gap go in public/card-art/<game>/.
 */
import { getAdapter } from '../src/shared/games/registry.ts'
import type { Card, GameId } from '../src/shared/types.ts'

const args = process.argv.slice(2)
const markdown = args.includes('--markdown')
const games = args.filter((a) => !a.startsWith('--')) as GameId[]
if (games.length === 0) games.push('riftbound')

function price(card: Card): string {
  return card.price != null ? `$${card.price.toFixed(2)}` : '-'
}

const lines: string[] = []
for (const gameId of games) {
  const adapter = getAdapter(gameId)
  const cards = await adapter.fetchAllCards(() => {})
  const missing = cards.filter((c) => !c.imageUrl)
  const bySet = new Map<string, Card[]>()
  for (const card of missing) bySet.set(card.setName, [...(bySet.get(card.setName) ?? []), card])
  const sets = [...bySet].sort((a, b) => b[1].length - a[1].length)

  if (markdown) {
    lines.push(`## ${adapter.shortName}: ${missing.length} of ${cards.length} cards have no picture`, '')
    for (const [setName, list] of sets) {
      lines.push(`<details><summary>${setName} (${list.length})</summary>`, '', '| Card | Number | Rarity | Price |', '|---|---|---|---|')
      for (const c of list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))) {
        lines.push(`| ${c.name.replace(/\|/g, '/')} | ${c.setCode} ${c.number} | ${c.rarity ?? ''} | ${price(c)} |`)
      }
      lines.push('', '</details>', '')
    }
  } else {
    lines.push(`${adapter.shortName}: ${missing.length} of ${cards.length} cards have no picture`)
    for (const [setName, list] of sets) {
      lines.push(`  ${setName} (${list.length})`)
      for (const c of list.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))) lines.push(`    ${c.setCode} ${c.number}  ${c.name}  ${c.rarity ?? ''}  ${price(c)}`)
    }
  }
}
console.log(lines.join('\n'))
