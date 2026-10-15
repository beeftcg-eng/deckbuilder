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
  /** For a listing TCGplayer hasn't filled in yet: its type, domains and Energy cost. */
  category?: string
  subtypes?: string[]
  colors?: string[]
  cost?: string | null
}

/**
 * Radiance cards TCGplayer listed without a card type, domains or Energy cost (October 2026), which
 * would otherwise come in as plain Units with no domain - Riven, The Exile couldn't be picked as a
 * Legend. From each card's page on Riftwatch (riftwatch.gg/cards/rad-<number>-167). [product id, type, domains, Energy]
 */
const RADIANCE_UNLISTED: [number, string, string[], number | null][] = [
  [723382, 'Champion Unit', ['Fury'], 5], // Ekko, Revolutionary (Overnumbered)
  [723412, 'Unit', ['Chaos'], 8], // Angler Wyrm
  [723413, 'Unit', ['Body'], 6], // Armored Tusker
  [723414, 'Spell', ['Calm'], 2], // Battle Preparations
  [723415, 'Unit', ['Body'], 8], // Bloodscent Swarm
  [723416, 'Spell', ['Order'], 3], // Burn Away
  [723417, 'Unit', ['Chaos'], 6], // Explosimian
  [723418, 'Spell', ['Fury'], 2], // Forbidden Technique
  [723419, 'Unit', ['Chaos'], 3], // Gutter Guardian
  [723420, 'Gear', ['Calm'], 4], // Hunting Blind
  [723421, 'Unit', ['Fury'], 4], // Incorrigible Construct
  [723423, 'Champion Unit', ['Calm'], 3], // Orianna, Exquisite (Alternate Art)
  [723424, 'Unit', ['Chaos'], 5], // Pitiless Stalker
  [723425, 'Gear', ['Order'], 2], // Protector's Shield
  [723432, 'Unit', ['Calm'], 4], // Stoic Ferryman
  [723433, 'Unit', ['Mind'], 2], // Strigian Oracle
  [723434, 'Legend', ['Calm', 'Chaos'], null], // Riven, The Exile
  [723435, 'Legend', ['Calm', 'Chaos'], null], // Riven, The Exile (Overnumbered)
  [723436, 'Unit', ['Mind'], 3], // Trinket Peddler
]

/** Radiance listings TCGplayer filled in wrong (October 2026), checked against riftwatch.gg. */
const RADIANCE_MISLISTED: Record<number, Override> = {
  723202: { colors: ['Fury'] }, // Antagonistic Apparatus, listed with no domain
  723208: { colors: ['Calm'] }, // Hush, listed with no domain
  723206: { colors: ['Mind'] }, // Gravity Field, listed as Calm
  723204: { colors: ['Chaos'] }, // Demon Shade, listed as Fury
  723215: { colors: ['Order'] }, // One-Two Punch, listed with no domain
  723228: { category: 'Unit', subtypes: ['Champion'] }, // Ziggs, Explosive, listed as a plain Unit
  722321: { name: 'Neeko, Blending In' }, // listed as "Neeko, Bleeding In"
}

/**
 * Where TCGplayer's listing needs correcting. The Vendetta promo runes (Pixelverse's art) are printed
 * "VEN · R01b · P" but TCGplayer files them under Organized Play Promos as "Fury Rune (Vendetta)", a
 * Common, with no picture; theirs are cropped from Riot's announcement image.
 * Most of Vendetta's showcase runes (Greg Ghielmetti's art, VEN R01a...) and Unleashed's promo runes
 * (UNL R01b...) have no TCGplayer picture either; the ones listed here are cropped from preview images.
 */
const OVERRIDES: Record<number, Override> = {
  ...Object.fromEntries(
    ([[709748, 'Fury'], [709746, 'Calm'], [709749, 'Mind'], [709745, 'Body'], [709747, 'Chaos'], [709750, 'Order']] as const).map(
      ([productId, domain], i) => [productId, { name: `${domain} Rune`, setId: 'VEN', rarity: 'Promo', image: `opp-r0${i + 1}b.png` }],
    ),
  ),
  ...Object.fromEntries(
    ([
      [709312, 'ven-r01a'], [709313, 'ven-r03a'], [709309, 'ven-r04a'], [709311, 'ven-r05a'], [709314, 'ven-r06a'],
      [694649, 'unl-r01b'], [694647, 'unl-r02b'], [694650, 'unl-r03b'], [694646, 'unl-r04b'], [694648, 'unl-r05b'], [694651, 'unl-r06b'],
    ] as const).map(
      ([productId, file]) => [productId, { image: `${file}.webp` }],
    ),
  ),
  ...Object.fromEntries(
    RADIANCE_UNLISTED.map(([productId, type, colors, energy]) => [productId, { ...categoryOf(type), colors, cost: energy == null ? null : String(energy) }]),
  ),
  ...RADIANCE_MISLISTED,
}

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
  const { category, subtypes } = base ? { category: base.category, subtypes: base.subtypes } : override.category ? { category: override.category, subtypes: override.subtypes ?? [] } : categoryOf(extra.type)
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
    colors: base?.colors ?? override.colors ?? extra.domains,
    cost: base ? base.cost : override.cost !== undefined ? override.cost : extra.energy != null ? String(extra.energy) : null,
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
  const typed = typedListings(extras)
  return extras
    .filter((e) => !have.has(String(e.productId)))
    .map((e) => toCard(withSiblingType(e, typed), bases.get(baseName(OVERRIDES[e.productId]?.name ?? e.name)), setNames, released))
}

/** The first listing with a card type for each card name. */
function typedListings(products: readonly RiftboundExtra[]): Map<string, RiftboundExtra> {
  const out = new Map<string, RiftboundExtra>()
  for (const p of products) if (p.type && !out.has(baseName(p.name))) out.set(baseName(p.name), p)
  return out
}

/** A listing TCGplayer left without a type ("Ekko, Revolutionary (Overnumbered)") takes it, and its domains and cost, from another printing of the card that has one. */
function withSiblingType(product: RiftboundExtra, typed: Map<string, RiftboundExtra>): RiftboundExtra {
  const sibling = product.type ? undefined : typed.get(baseName(product.name))
  if (!sibling) return product
  return { ...product, type: sibling.type, domains: product.domains.length ? product.domains : sibling.domains, energy: product.energy ?? sibling.energy }
}

/**
 * Card listings that would come in as plain Units with no domain: no card type, none on another
 * printing of the card, and no override. The daily price build warns about them, so a new set's
 * unfinished listings get noticed (riftcodex may still have the card; the build can't ask it).
 */
export function listingsMissingType(products: readonly RiftboundExtra[]): RiftboundExtra[] {
  const typed = typedListings(products)
  return products.filter((p) => isCard(p) && !p.type && !OVERRIDES[p.productId]?.category && !typed.has(baseName(p.name)))
}

/**
 * riftcodex shows the Origins Organized Play promo runes (OPP 007b/298 ... 214b/298, Greg Ghielmetti &
 * Leah Chen's art) with Vendetta's common rune pictures - "VEN · R01" is printed right on them. Theirs
 * are published with the phone app.
 */
export function withPromoRuneArt(cards: Card[]): Card[] {
  return cards.map((card) => {
    const m = /^opp-(\d{3})b-298$/.exec(card.sourceId)
    if (!m || card.category !== 'Rune') return card
    const imageUrl = `${ART_URL}/opp-${m[1]}b.webp`
    return { ...card, imageUrl, imageUrlSmall: imageUrl }
  })
}

/** "Fury Rune", not "Fury Rune (Alternate Art)" or a promo. */
function isRegularRune(card: Card): boolean {
  return card.category === 'Rune' && card.rarity === 'Common' && /^\w+ Rune$/.test(card.name)
}

/**
 * Every set reprints the six regular runes, all the same card worth about a dime; only Origins' are
 * listed, so the browser isn't six rows of each. The others' ids are kept on Origins' (formerIds) so
 * copies saved against them move over (cardIdRepair.ts).
 */
export function onlyOriginsRegularRunes(cards: Card[]): Card[] {
  const origins = new Map(cards.filter((c) => c.setId === 'OGN' && isRegularRune(c)).map((c) => [c.name, c]))
  const formerIds = new Map<string, string[]>()
  const kept = cards.filter((card) => {
    const target = card.setId !== 'OGN' && isRegularRune(card) ? origins.get(card.name) : undefined
    if (!target) return true
    formerIds.set(target.id, [...(formerIds.get(target.id) ?? []), card.id, ...(card.formerIds ?? [])])
    return false
  })
  return kept.map((card) => {
    const moved = formerIds.get(card.id)
    return moved ? { ...card, formerIds: [...(card.formerIds ?? []), ...moved] } : card
  })
}

/**
 * Overnumbered printings (numbered past the set's size, "187/166") share the Showcase rarity with alternate arts;
 * as a subtype they get their own Kind chip in the browser, like Signature.
 */
export function withOvernumberedKind(cards: Card[]): Card[] {
  return cards.map((card) =>
    /\(Overnumbered\)/i.test(card.name) && !card.subtypes.includes('Overnumbered') ? { ...card, subtypes: [...card.subtypes, 'Overnumbered'] } : card,
  )
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

/**
 * The name, type, domains and cost OVERRIDES give TCGplayer's unfilled or mistaken listings, put on card data
 * saved before they existed: the cards are only downloaded again weekly, and till then Riven, The Exile
 * would stay a Unit.
 */
export function withListingFixes(cards: Card[]): Card[] {
  return cards.map((card) => {
    const fix = card.id.startsWith(EXTRA_ID_PREFIX) ? OVERRIDES[Number(card.id.slice(EXTRA_ID_PREFIX.length))] : undefined
    if (!fix?.category && !fix?.colors && !fix?.name) return card
    return {
      ...card,
      ...(fix.name ? { name: fix.name } : {}),
      ...(fix.category ? { category: fix.category, subtypes: fix.subtypes ?? [] } : {}),
      colors: fix.colors ?? card.colors,
      cost: fix.cost !== undefined ? fix.cost : card.cost,
    }
  })
}

/**
 * Legend names riftcodex has garbled: a region tag in front ("Yordle, Kennen - Heart of the Tempest")
 * or the champion left off ("Defender of Tomorrow", whose other printings say "Jayce - Defender of
 * Tomorrow"). Fixed so the card reads, searches and matches its Champion like every other Legend.
 */
export function withFixedLegendNames(cards: Card[]): Card[] {
  const legends = cards.filter((c) => c.category === 'Legend')
  const note = (name: string) => /\s*\([^)]*\)\s*$/.exec(name)?.[0] ?? ''
  const base = (name: string) => name.slice(0, name.length - note(name).length)
  return cards.map((card) => {
    if (card.category !== 'Legend') return card
    const tagged = /^[A-Z][\w'-]*, ([^,]+ - .+)$/.exec(card.name)
    if (tagged) return { ...card, name: tagged[1] }
    const title = base(card.name)
    if (/, | - /.test(title)) return card
    const named = legends.find((l) => l.setId === card.setId && base(l.name).endsWith(` - ${title}`))
    return named ? { ...card, name: `${base(named.name).replace(/^[A-Z][\w'-]*, (?=[^,]+ - )/, '')}${note(card.name)}` } : card
  })
}
