import type { Card } from '../types'

/**
 * Rune printings riftcodex doesn't list, worked out from TCGplayer's catalog (tcgcsv.com, checked Oct 2026).
 * riftcodex has Origins' alternate-art runes and the 0xxb Organized Play promos, but none of these:
 *  - Vendetta's Showcase runes (VEN R01a-R06a),
 *  - the Vendetta promo runes, Pixelverse's art, printed "VEN · R01b · P" (TCGplayer files them under
 *    Organized Play Promos as "Fury Rune (Vendetta)"),
 *  - the R01c-R06c Organized Play promos.
 * Pictures: TCGplayer has one (Calm R02a); the R0xb ones are cropped from Riot's announcement image and
 * published with the phone app (public/card-art); riftcodex and Riot's card gallery have none, so the
 * rest show the no-image placeholder. Prices come from the price file like every other Riftbound card,
 * by TCGplayer product id.
 *
 * Their ids are fixed ("riftbound:tcg-<product id>") so a collection keeps them if riftcodex later adds
 * the same printing: withMissingRunes() then drops riftcodex's copy instead, borrowing its picture.
 */

const ART_URL = 'https://beeftcg-eng.github.io/deckbuilder/card-art/riftbound'

interface MissingRune {
  productId: string
  domain: 'Fury' | 'Calm' | 'Mind' | 'Body' | 'Chaos' | 'Order'
  setId: 'VEN' | 'OPP'
  /** As printed, lower case: "r01a". */
  code: string
  rarity: 'Showcase' | 'Promo'
  image?: string
}

const MISSING_RUNES: MissingRune[] = [
  { productId: '709312', domain: 'Fury', setId: 'VEN', code: 'r01a', rarity: 'Showcase' },
  { productId: '709310', domain: 'Calm', setId: 'VEN', code: 'r02a', rarity: 'Showcase', image: 'https://tcgplayer-cdn.tcgplayer.com/product/709310_in_1000x1000.jpg' },
  { productId: '709313', domain: 'Mind', setId: 'VEN', code: 'r03a', rarity: 'Showcase' },
  { productId: '709309', domain: 'Body', setId: 'VEN', code: 'r04a', rarity: 'Showcase' },
  { productId: '709311', domain: 'Chaos', setId: 'VEN', code: 'r05a', rarity: 'Showcase' },
  { productId: '709314', domain: 'Order', setId: 'VEN', code: 'r06a', rarity: 'Showcase' },
  { productId: '709748', domain: 'Fury', setId: 'VEN', code: 'r01b', rarity: 'Promo', image: 'opp-r01b.png' },
  { productId: '709746', domain: 'Calm', setId: 'VEN', code: 'r02b', rarity: 'Promo', image: 'opp-r02b.png' },
  { productId: '709749', domain: 'Mind', setId: 'VEN', code: 'r03b', rarity: 'Promo', image: 'opp-r03b.png' },
  { productId: '709745', domain: 'Body', setId: 'VEN', code: 'r04b', rarity: 'Promo', image: 'opp-r04b.png' },
  { productId: '709747', domain: 'Chaos', setId: 'VEN', code: 'r05b', rarity: 'Promo', image: 'opp-r05b.png' },
  { productId: '709750', domain: 'Order', setId: 'VEN', code: 'r06b', rarity: 'Promo', image: 'opp-r06b.png' },
  { productId: '697499', domain: 'Fury', setId: 'OPP', code: 'r01c', rarity: 'Promo' },
  { productId: '697497', domain: 'Calm', setId: 'OPP', code: 'r02c', rarity: 'Promo' },
  { productId: '697496', domain: 'Mind', setId: 'OPP', code: 'r03c', rarity: 'Promo' },
  { productId: '697495', domain: 'Body', setId: 'OPP', code: 'r04c', rarity: 'Promo' },
  { productId: '697493', domain: 'Chaos', setId: 'OPP', code: 'r05c', rarity: 'Promo' },
  { productId: '697492', domain: 'Order', setId: 'OPP', code: 'r06c', rarity: 'Promo' },
]

const SET_NAMES: Record<MissingRune['setId'], string> = { VEN: 'Vendetta', OPP: 'Riftbound Organized Play Promotional Cards' }

function toCard(rune: MissingRune, setNames: Map<string, string>, released: Map<string, string>): Card {
  const imageUrl = rune.image ? (rune.image.startsWith('https://') ? rune.image : `${ART_URL}/${rune.image}`) : null
  const date = released.get(rune.setId)
  return {
    id: `riftbound:tcg-${rune.productId}`,
    gameId: 'riftbound',
    sourceId: `${rune.setId.toLowerCase()}-${rune.code}`,
    // Named the way riftcodex names Origins' runes: Showcase art says so, promos keep the plain name.
    name: `${rune.domain} Rune${rune.rarity === 'Showcase' ? ' (Alternate Art)' : ''}`,
    imageUrl,
    imageUrlSmall: imageUrl,
    orientation: 'portrait',
    setId: rune.setId,
    setName: setNames.get(rune.setId) ?? SET_NAMES[rune.setId],
    setCode: rune.setId,
    // riftcodex numbers VEN R01 as "1"; the letter keeps the printings apart.
    number: rune.code.replace(/^r0*/, ''),
    rarity: rune.rarity,
    category: 'Rune',
    subtypes: ['Basic'],
    colors: [rune.domain],
    cost: null,
    text: null,
    legality: null,
    price: null,
    tcgplayerId: rune.productId,
    ...(date ? { released: date } : {}),
  }
}

/** `cards` plus the rune printings riftcodex lacks, before prices are applied. */
export function withMissingRunes(cards: Card[]): Card[] {
  const byProduct = new Map<string, Card>()
  const setNames = new Map<string, string>()
  const released = new Map<string, string>()
  for (const card of cards) {
    if (card.tcgplayerId) byProduct.set(card.tcgplayerId, card)
    setNames.set(card.setId, card.setName)
    if (card.released) released.set(card.setId, card.released)
  }
  const covered = new Set<string>()
  const extra = MISSING_RUNES.map((rune) => {
    const card = toCard(rune, setNames, released)
    const theirs = byProduct.get(rune.productId)
    if (!theirs) return card
    covered.add(theirs.id)
    return card.imageUrl ? card : { ...card, imageUrl: theirs.imageUrl, imageUrlSmall: theirs.imageUrlSmall }
  })
  return [...cards.filter((c) => !covered.has(c.id)), ...extra]
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
