import type { Card } from '../types'
import { riftboundKey, type RiftboundExtra } from '../priceKeys'

/**
 * Riftbound printings TCGplayer lists but riftcodex doesn't: Nexus Night and tournament promos, Signature
 * cards, most rune printings, a new set's first cards... scripts/build-prices.ts publishes TCGplayer's
 * printings each day (prices/riftbound-printings.json); a sync works out which riftcodex lacks
 * (missingPrintings) and turns them into cards (extraCards), priced by product id like every other card.
 *
 * Their ids are "riftbound:tcg-<product id>". Once riftcodex lists the printing itself, it's no longer
 * added and cardIdRepair.ts moves saved copies to riftcodex's card with that product id.
 */

const ART_URL = 'https://beeftcg-eng.github.io/deckbuilder/card-art/riftbound'
const TCGPLAYER_IMAGE = (productId: number) => `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`

export const EXTRA_ID_PREFIX = 'riftbound:tcg-'

interface Override {
  name?: string
  setId?: string
  rarity?: string
  /** A picture published with the phone app (public/card-art/riftbound). */
  image?: string
}

/**
 * Where TCGplayer's listing needs correcting. The Vendetta promo runes (Pixelverse's art) are printed
 * "VEN · R01b · P" but TCGplayer files them under Organized Play Promos as "Fury Rune (Vendetta)", a
 * Common, with no picture; theirs are cropped from Riot's announcement image.
 */
const OVERRIDES: Record<number, Override> = Object.fromEntries(
  ([[709748, 'Fury'], [709746, 'Calm'], [709749, 'Mind'], [709745, 'Body'], [709747, 'Chaos'], [709750, 'Order']] as const).map(
    ([productId, domain], i) => [productId, { name: `${domain} Rune`, setId: 'VEN', rarity: 'Promo', image: `opp-r0${i + 1}b.png` }],
  ),
)

const PARENTHETICAL = /\s*\(([^)]*)\)/g
/** "(R01a)" in TCGplayer's rune names is just the printed number. */
const RUNE_CODE = /^R\d+[a-z]?$/i

/** "Ahri - Alluring (Alternate Art)" and "Ahri, Alluring" are the same card: riftcodex dashes titles, TCGplayer commas them. */
function baseName(name: string): string {
  return name.replace(PARENTHETICAL, '').replace(' - ', ', ').trim().toLowerCase()
}

function fullName(name: string): string {
  return name.replace(' - ', ', ').trim().toLowerCase()
}

/** Set, number and the set size it's numbered in: Organized Play promos reuse numbers ("065/166" Swain, "065/219" Icevale Archer). */
function sourceKey(card: Card): string {
  const [set, number, total] = card.sourceId.split('-')
  return `${riftboundKey(set ?? '', number ?? '')}|${total ?? ''}`
}

function productKey(product: RiftboundExtra): string {
  const [number, total] = product.number.split('/').map((s) => s.trim())
  return `${riftboundKey(product.group, number)}|${total ? String(Number(total)).padStart(3, '0') : ''}`
}

/** Tokens and oversized display cards aren't collected or played as cards. */
function isCard(product: RiftboundExtra): boolean {
  return Boolean(product.number) && !product.number.includes('//') && !/token/i.test(product.type ?? '') && !/\(Oversized\)/i.test(product.name)
}

/**
 * The products riftcodex doesn't have. riftcodex gives most cards their product id;
 * a card without one (a brand-new set) counts as the product with its set and number - and, when several
 * products share that number (a promo's Top 8 and Champion versions), its name.
 */
export function missingPrintings(products: readonly RiftboundExtra[], cards: readonly Card[]): RiftboundExtra[] {
  const ids = new Set(cards.flatMap((c) => (c.tcgplayerId ? [c.tcgplayerId] : [])))
  const withoutId = new Map<string, Card[]>()
  for (const card of cards) {
    if (card.tcgplayerId) continue
    const key = sourceKey(card)
    withoutId.set(key, [...(withoutId.get(key) ?? []), card])
  }
  const candidates = products.filter((p) => isCard(p) && !ids.has(String(p.productId)))
  const sharing = new Map<string, number>()
  for (const p of candidates) {
    const key = productKey(p)
    sharing.set(key, (sharing.get(key) ?? 0) + 1)
  }
  return candidates.filter((p) => {
    const key = productKey(p)
    const same = withoutId.get(key)
    if (!same) return true
    if (sharing.get(key) === 1) return false
    return !same.some((c) => fullName(c.name) === fullName(p.name))
  })
}

function categoryOf(type: string | null): { category: string; subtypes: string[] } {
  const main = (type ?? '').split(';')[0].trim()
  if (main === 'Champion Unit') return { category: 'Unit', subtypes: ['Champion'] }
  const signature = /^Signature (.+)$/.exec(main)
  if (signature) return { category: signature[1], subtypes: ['Signature'] }
  if (main === 'Rune') return { category: 'Rune', subtypes: ['Basic'] }
  return { category: main || 'Unit', subtypes: [] }
}

function plainText(html: string | null): string | null {
  if (!html) return null
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() || null
}

/** "002/166" -> "2", "R01a" -> "1a" (riftcodex numbers VEN R01 as "1"), "T1A 001/005" -> "T1A 1". */
function collectorNumber(number: string): string {
  return number.split('/')[0].trim().replace(/^R0*/i, '').replace(/(^|\s)0+(?=\d)/g, '$1')
}

function toCard(extra: RiftboundExtra, base: Card | undefined, setNames: Map<string, string>, released: Map<string, string>): Card {
  const override = OVERRIDES[extra.productId] ?? {}
  const setId = override.setId ?? extra.group
  const [printed, total] = extra.number.split('/').map((s) => s.trim().replace(/\s+/g, ''))
  const isRune = categoryOf(extra.type).category === 'Rune'
  const rarity = override.rarity ?? extra.rarity

  // The base card's name as riftcodex writes it, plus TCGplayer's qualifiers ("(Top 8)", "(Signature)").
  const qualifiers = [...extra.name.matchAll(PARENTHETICAL)].map((m) => m[1]).filter((q) => !RUNE_CODE.test(q))
  if (isRune && rarity === 'Showcase' && qualifiers.length === 0) qualifiers.push('Alternate Art') // as riftcodex names Origins' alt runes
  const plain = base ? base.name.replace(PARENTHETICAL, '').trim() : extra.name.replace(PARENTHETICAL, '').trim()
  const name = override.name ?? [plain, ...qualifiers.map((q) => `(${q})`)].join(' ')

  const imageUrl = override.image ? `${ART_URL}/${override.image}` : extra.image ? TCGPLAYER_IMAGE(extra.productId) : null
  const date = released.get(setId) ?? extra.released
  const { category, subtypes } = base ? { category: base.category, subtypes: base.subtypes } : categoryOf(extra.type)
  return {
    id: `${EXTRA_ID_PREFIX}${extra.productId}`,
    gameId: 'riftbound',
    sourceId: [setId, printed, total].filter(Boolean).join('-').toLowerCase(),
    name,
    imageUrl,
    imageUrlSmall: imageUrl,
    orientation: base?.orientation ?? (category === 'Battlefield' ? 'landscape' : 'portrait'),
    setId,
    setName: setNames.get(setId) ?? (setId === extra.group ? extra.groupName : setId),
    setCode: setId,
    number: collectorNumber(extra.number),
    rarity,
    category,
    subtypes,
    colors: base?.colors ?? extra.domains,
    cost: base ? base.cost : extra.energy != null ? String(extra.energy) : null,
    text: base ? base.text : plainText(extra.text),
    legality: null,
    price: null,
    tcgplayerId: String(extra.productId),
    ...(date ? { released: date } : {}),
  }
}

/** Cards for the price file's extra printings (the ones `cards` doesn't already have), before prices are applied. */
export function extraCards(extras: readonly RiftboundExtra[], cards: readonly Card[]): Card[] {
  const have = new Set(cards.flatMap((c) => (c.tcgplayerId ? [c.tcgplayerId] : [])))
  const bases = new Map<string, Card>()
  const setNames = new Map<string, string>()
  const released = new Map<string, string>()
  for (const card of cards) {
    // The regular printing, not an alt art or a promo, lends its text and type.
    const key = baseName(card.name)
    if (!bases.has(key) || /\(/.test(bases.get(key)!.name)) bases.set(key, card)
    setNames.set(card.setId, card.setName)
    if (card.released) released.set(card.setId, card.released)
  }
  return extras
    .filter((e) => !have.has(String(e.productId)))
    .map((e) => toCard(e, bases.get(baseName(OVERRIDES[e.productId]?.name ?? e.name)), setNames, released))
}

/**
 * riftcodex shows the Origins Organized Play promo runes (OPP 007b/298 ... 214b/298) with Vendetta's
 * common rune pictures - "VEN · R01" is printed right on them. No source has a picture of the promos
 * themselves; their number makes them variants of Origins' runes (OGN 007/298), so they show that art.
 */
export function withOriginsRuneArt(cards: Card[]): Card[] {
  const bySource = new Map(cards.map((c) => [c.sourceId, c]))
  return cards.map((card) => {
    const m = /^opp-(\d{3})b-298$/.exec(card.sourceId)
    const origins = m && card.category === 'Rune' ? bySource.get(`ogn-${m[1]}-298`) : undefined
    return origins ? { ...card, imageUrl: origins.imageUrl, imageUrlSmall: origins.imageUrlSmall } : card
  })
}

/**
 * A sync that couldn't load the printings file has none of its extra printings; the previous sync's are kept
 * rather than turning everyone's copies of them into unknown cards until the next sync.
 */
export function keepExtrasWhenMissing(fresh: Card[], previous: readonly Card[]): Card[] {
  if (fresh.some((c) => c.id.startsWith(EXTRA_ID_PREFIX))) return fresh
  const ids = new Set(fresh.map((c) => c.id))
  const products = new Set(fresh.flatMap((c) => (c.tcgplayerId ? [c.tcgplayerId] : [])))
  const kept = previous.filter((c) => c.id.startsWith(EXTRA_ID_PREFIX) && !ids.has(c.id) && !products.has(c.tcgplayerId ?? ''))
  return kept.length ? [...fresh, ...kept] : fresh
}
