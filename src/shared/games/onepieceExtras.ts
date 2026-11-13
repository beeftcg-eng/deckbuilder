import type { Card } from '../types'

/**
 * One Piece cards the card source (optcgapi) doesn't have yet. A new set is often on TCGplayer and in
 * tournament lists days or weeks before optcgapi adds it, so you couldn't build with it, and lists
 * using it couldn't be read. The daily deploy publishes TCGplayer's listings for the newest sets
 * (prices/onepiece-extras.json, scripts/build-prices.ts); a sync adds a card for every card number
 * optcgapi doesn't know, from its plainest listing.
 *
 * Its id is the one optcgapi gives a card's regular printing (`onepiece:OP18-021`), so a deck built
 * with it keeps working once optcgapi catches up and the real card replaces this one.
 */

export interface OnePieceListing {
  productId: number
  /** TCGplayer's name: "Franky", "Saint Shamrock (Alternate Art)". */
  name: string
  /** The card number: "OP18-021". */
  number: string
  rarity: string | null
  cardType: string | null
  /** "Green;Purple" */
  color: string | null
  cost: string | null
  power: string | null
  counter: string | null
  life: string | null
  attribute: string | null
  /** "Straw Hat Crew;Water Seven" */
  subtypes: string | null
  /** HTML. */
  description: string | null
  /** TCGplayer's set abbreviation ("OP18") and name. */
  set: string
  setName: string
  /** The set's release date (YYYY-MM-DD). */
  released: string | null
  price: number | null
}

export interface OnePieceExtrasFile {
  updatedAt: string
  listings: OnePieceListing[]
}

const KNOWN_COLORS = new Set(['Red', 'Green', 'Blue', 'Purple', 'Black', 'Yellow'])
export const TCGPLAYER_IMAGE = (productId: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`

/** TCGplayer's set abbreviation as optcgapi writes set ids: "OP18" -> "OP-18", "ST-31" stays. */
export function onepieceSetId(abbreviation: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(abbreviation.trim())
  return m ? `${m[1]}-${m[2]}` : abbreviation.trim()
}

/** A card number as optcgapi writes one: two to four letters and digits, a dash, three digits. */
export const isCardNumber = (n: string) => /^[A-Z]{1,4}\d{0,3}-\d{3}$/.test(n)

/** The listing's name without TCGplayer's printing notes: "Loki (OP17-119) (Alternate Art)" -> "Loki". */
const plainName = (name: string) => name.replace(/\s*\([^)]*\)/g, '').trim()

/** How plain a listing is: no notes in its name beats "(Alternate Art)" and friends. */
const notes = (name: string) => (name.match(/\(/g) ?? []).length

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function listingToCard(l: OnePieceListing): Card {
  const info: string[] = []
  if (l.power) info.push(`Power: ${l.power}`)
  if (l.life) info.push(`Life: ${l.life}`)
  if (l.counter) info.push(`Counter: ${l.counter.replace(/^\+/, '')}`)
  if (l.attribute) info.push(`Attribute: ${l.attribute}`)
  if (l.description) info.push(plainText(l.description))
  const image = TCGPLAYER_IMAGE(l.productId)
  const setId = onepieceSetId(l.set)
  return {
    id: `onepiece:${l.number}`,
    gameId: 'onepiece',
    sourceId: l.number,
    name: plainName(l.name),
    imageUrl: image,
    imageUrlSmall: image,
    orientation: 'portrait',
    setId,
    setName: l.setName,
    setCode: setId,
    number: l.number.slice(l.number.lastIndexOf('-') + 1),
    rarity: l.rarity,
    category: l.cardType ?? 'Character',
    subtypes: l.subtypes ? [l.subtypes.split(';').map((s) => s.trim()).filter(Boolean).join(' ')] : [],
    colors: (l.color ?? '').split(/[;/\s]+/).filter((c) => KNOWN_COLORS.has(c)),
    cost: l.cost,
    text: info.length ? info.join('\n') : null,
    legality: null,
    price: l.price != null && l.price > 0 ? l.price : null,
    ...(l.released ? { setReleased: l.released } : {}),
  }
}

/**
 * Cards for the numbers `cards` doesn't have, one per number from its plainest listing. Listings that
 * aren't cards (sealed product, DON!!: no card number or type) are skipped.
 */
export function extraOnePieceCards(listings: readonly OnePieceListing[], cards: readonly Card[]): Card[] {
  const known = new Set(cards.filter((c) => c.gameId === 'onepiece').map((c) => c.sourceId))
  const best = new Map<string, OnePieceListing>()
  for (const l of listings) {
    if (!isCardNumber(l.number) || !l.cardType || known.has(l.number)) continue
    const seen = best.get(l.number)
    if (!seen || notes(l.name) < notes(seen.name)) best.set(l.number, l)
  }
  return [...best.values()].sort((a, b) => a.number.localeCompare(b.number)).map(listingToCard)
}

/** The file, if it's one. */
export function readOnePieceExtras(raw: unknown): OnePieceListing[] {
  const r = raw as Partial<OnePieceExtrasFile> | null
  if (!r || !Array.isArray(r.listings)) return []
  return r.listings.filter((l): l is OnePieceListing => !!l && typeof l.number === 'string' && typeof l.name === 'string' && typeof l.productId === 'number' && typeof l.set === 'string')
}
