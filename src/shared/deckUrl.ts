import type { Card, GameId } from './types'
import type { ParsedDeck } from './importDeck'
import { poolKey } from './collection'
import { cleanTags } from './deckTags'

/**
 * Importing a deck from a link to a deck site. Each site's page (or API) is turned into decklist text
 * the paste importer (importDeck.ts) already reads, plus what text can't carry: Archidekt's exact
 * printings and its card categories (which become the deck's tags, deckTags.ts).
 *
 * The pages are read by the desktop app's main process: none of these sites lets another web page
 * read them (no CORS), so the phone app can only try, and says to paste the list when it can't.
 * Moxfield blocks programs from reading its decks outright, so it isn't here: its Export → Copy
 * for MTGO text pastes fine.
 */

export type DeckSite = 'archidekt' | 'limitless-pokemon' | 'limitless-onepiece'

export interface DeckUrlTarget {
  site: DeckSite
  gameId: GameId
  /** What to fetch: the site's API or the page itself. */
  fetchUrl: string
}

/** The deck behind a link, or null for a link this can't import. */
export function deckUrlTarget(input: string): DeckUrlTarget | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\./, '')
  const path = url.pathname
  if (host === 'archidekt.com') {
    const id = /^\/decks\/(\d+)/.exec(path)?.[1]
    return id ? { site: 'archidekt', gameId: 'mtg', fetchUrl: `https://archidekt.com/api/decks/${id}/` } : null
  }
  if (host === 'limitlesstcg.com') {
    const id = /^\/decks\/list\/(?:jp\/)?(\d+)/.exec(path)?.[1]
    return id ? { site: 'limitless-pokemon', gameId: 'pokemon', fetchUrl: `https://limitlesstcg.com/decks/list/${id}` } : null
  }
  if (host === 'onepiece.limitlesstcg.com') {
    const id = /^\/decks\/list\/(\d+)/.exec(path)?.[1]
    return id ? { site: 'limitless-onepiece', gameId: 'onepiece', fetchUrl: `https://onepiece.limitlesstcg.com/decks/list/${id}` } : null
  }
  return null
}

/** The hosts deckUrlTarget can send a fetch to (the desktop app refuses any other). */
export const DECK_SITE_HOSTS = ['archidekt.com', 'limitlesstcg.com', 'onepiece.limitlesstcg.com'] as const

export interface DeckFromSite {
  name: string | null
  /** Decklist text in a shape importDeck.ts reads. */
  text: string
  /** Exact printings by card name (Archidekt's Scryfall ids), to put back after the text import picks its own. */
  printings: Map<string, string>
  /** Tags by card name, from the site's categories. */
  tags: Map<string, string[]>
}

// ---------- Archidekt ----------

interface ArchidektDeck {
  name?: string
  categories?: { name: string; includedInDeck?: boolean; isPremier?: boolean }[]
  cards?: {
    quantity?: number
    categories?: string[] | null
    card?: { uid?: string; oracleCard?: { name?: string } }
  }[]
}

/** Categories that are deck zones rather than labels. */
const ZONE_CATEGORIES: Record<string, 'commander' | 'sideboard'> = { commander: 'commander', sideboard: 'sideboard', companion: 'sideboard' }

export function fromArchidekt(json: unknown): DeckFromSite {
  const deck = (json ?? {}) as ArchidektDeck
  const outOfDeck = new Set((deck.categories ?? []).filter((c) => c.includedInDeck === false).map((c) => c.name.toLowerCase()))
  const zones: Record<'commander' | 'main' | 'sideboard', string[]> = { commander: [], main: [], sideboard: [] }
  const printings = new Map<string, string>()
  const tags = new Map<string, string[]>()
  for (const entry of deck.cards ?? []) {
    const name = entry.card?.oracleCard?.name
    const quantity = entry.quantity ?? 0
    if (!name || quantity <= 0) continue
    const categories = entry.categories ?? []
    // Maybeboard and other "not in the deck" categories stay out, as in Archidekt's own count.
    if (categories.length && categories.every((c) => outOfDeck.has(c.toLowerCase()))) continue
    const zone = categories.map((c) => ZONE_CATEGORIES[c.toLowerCase()]).find(Boolean) ?? 'main'
    zones[zone].push(`${quantity} ${name}`)
    if (entry.card?.uid) printings.set(name, entry.card.uid)
    const labels = cleanTags(categories.filter((c) => !ZONE_CATEGORIES[c.toLowerCase()] && !outOfDeck.has(c.toLowerCase())))
    if (labels.length) tags.set(name, labels)
  }
  const blocks = [
    zones.commander.length ? `Commander\n${zones.commander.join('\n')}` : '',
    zones.main.length ? `Main Deck\n${zones.main.join('\n')}` : '',
    zones.sideboard.length ? `Sideboard\n${zones.sideboard.join('\n')}` : '',
  ].filter(Boolean)
  return { name: deck.name?.trim() || null, text: blocks.join('\n\n'), printings, tags }
}

// ---------- Limitless ----------

const decodeHtml = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .trim()

function pageTitle(html: string): string | null {
  const title = /<div class="decklist-title">\s*([^<]+?)\s*</.exec(html)?.[1]
  return title ? decodeHtml(title) : null
}

/** limitlesstcg.com's Pokémon lists: "3 Charmander PAF 7" per card, the way Pokémon TCG Live exports. */
export function fromLimitlessPokemon(html: string): DeckFromSite {
  const lines: string[] = []
  const card = /<div class="decklist-card"[^>]*data-set="([^"]*)"[^>]*data-number="([^"]*)"[^>]*>[\s\S]*?<span class="card-count">\s*(\d+)\s*<\/span>\s*<span class="card-name">([^<]+)<\/span>/g
  for (let m = card.exec(html); m; m = card.exec(html)) {
    const [, set, number, count, name] = m
    lines.push(`${count} ${decodeHtml(name)}${set && number ? ` ${set} ${number}` : ''}`)
  }
  return { name: pageTitle(html), text: lines.join('\n'), printings: new Map(), tags: new Map() }
}

/** onepiece.limitlesstcg.com's lists: "4xOP01-006" per card, the Bandai simulator's format. */
export function fromLimitlessOnePiece(html: string): DeckFromSite {
  const lines: string[] = []
  const card = /<div class="decklist-card"[^>]*data-count="(\d+)"[^>]*data-id="([^"]+)"/g
  for (let m = card.exec(html); m; m = card.exec(html)) lines.push(`${m[1]}x${m[2]}`)
  return { name: pageTitle(html), text: lines.join('\n'), printings: new Map(), tags: new Map() }
}

export function deckFromSite(site: DeckSite, body: string): DeckFromSite {
  if (site === 'archidekt') return fromArchidekt(JSON.parse(body))
  if (site === 'limitless-pokemon') return fromLimitlessPokemon(body)
  return fromLimitlessOnePiece(body)
}

// ---------- after the text import ----------

/** A Magic printing by its Scryfall id: the regular printing keeps the oracle id, the others are named after their image file (cardIds.ts). */
function byScryfallId(cardsById: Map<string, Card>): Map<string, Card> {
  const out = new Map<string, Card>()
  for (const card of cardsById.values()) {
    const stem = (card.imageUrl ?? '').split(/[?#]/)[0].split('/').pop()?.replace(/\.[A-Za-z0-9]+$/, '')
    if (stem) out.set(stem, card)
    out.set(card.id.slice(card.id.indexOf(':') + 1), card)
  }
  return out
}

/**
 * The imported deck with the site's exact printings put back (the text import picks a printing by
 * itself), and the tags it had, keyed the way deckTags.ts keys them.
 */
export function applySiteExtras(parsed: ParsedDeck, site: DeckFromSite, cardsById: Map<string, Card>): { parsed: ParsedDeck; tags: Record<string, string[]> } {
  const tags: Record<string, string[]> = {}
  if (!site.printings.size && !site.tags.size) return { parsed, tags }
  const exact = site.printings.size ? byScryfallId(cardsById) : new Map<string, Card>()
  const byPool = new Map<string, Card>()
  for (const uid of site.printings.values()) {
    const card = exact.get(uid)
    if (card) byPool.set(poolKey(card), card)
  }
  const zones = Object.fromEntries(
    Object.entries(parsed.zones).map(([zoneId, entries]) => {
      const merged = new Map<string, number>()
      for (const { cardId, quantity } of entries) {
        const card = cardsById.get(cardId)
        const id = (card && byPool.get(poolKey(card))?.id) ?? cardId
        merged.set(id, (merged.get(id) ?? 0) + quantity)
      }
      return [zoneId, [...merged].map(([cardId, quantity]) => ({ cardId, quantity }))]
    }),
  )
  // Tags go by the card as imported, whatever printing it landed on.
  const nameToPool = new Map<string, string>()
  for (const entries of Object.values(zones)) {
    for (const { cardId } of entries) {
      const card = cardsById.get(cardId)
      if (card) nameToPool.set(card.name.split(' // ')[0].toLowerCase(), poolKey(card))
    }
  }
  for (const [name, labels] of site.tags) {
    const key = nameToPool.get(name.split(' // ')[0].toLowerCase())
    if (key) tags[key] = labels
  }
  return { parsed: { ...parsed, zones }, tags }
}
