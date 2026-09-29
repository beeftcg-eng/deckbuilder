/**
 * How TCGplayer prices (from tcgcsv.com's daily dump) are matched to this app's cards. Used on both
 * sides: scripts/build-prices.ts writes prices/<game>.json under these keys when the phone app is
 * deployed, and the game adapters look their cards up with the same keys. No imports, so the build
 * script can load this file directly.
 */

/** Where the deployed price files live (the phone app's own site, so the phone reads them same-origin). */
export const PRICE_FILES_URL = 'https://beeftcg-eng.github.io/deckbuilder/prices'

export interface PriceFile {
  updatedAt: string
  /** key -> USD market price */
  prices: Record<string, number>
}

/** "001/165" -> "1", "SWSH048" -> "swsh48", "TG12" -> "tg12", "A01" -> "a1". */
export function normalizeNumber(number: string): string {
  const main = number.split('/')[0].trim().toLowerCase()
  return main.replace(/^([a-z]*)0+(?=\d)/, '$1')
}

/**
 * Riftbound by set and printed number, variant suffix included ("VEN" + "021a/166" = the alternate
 * art): for cards whose TCGplayer id the card data doesn't have yet (a brand-new set).
 */
export function riftboundKey(setCode: string, number: string): string {
  return `RB|${setCode.toUpperCase()}|${normalizeNumber(number)}`
}

/**
 * A Riftbound card's price key: its TCGplayer product id, or - only when the card data has none yet -
 * set + printed number from its source id ("ven-021a-166"). A card with an id but no price stays
 * unpriced: its slot can be shared by a different product (a Metal promo and the regular one).
 */
export function riftboundKeys(productId: string | undefined, sourceId: string): string[] {
  if (productId) return [productId]
  const [set, number] = sourceId.split('-')
  return set && number ? [riftboundKey(set, number)] : []
}

/** Pokémon: set code (TCGplayer's abbreviation = the card data's ptcgo code) + collector number. */
export function pokemonKey(setCode: string, number: string): string {
  // "SWSH08" and "swsh8" are the same set; so are "SWSH12: TG" and "swsh12tg".
  const set = setCode.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/([A-Z])0+(?=\d)/g, '$1')
  return `${set}|${normalizeNumber(number)}`
}

/** Black Star promos: their numbers carry the era ("SWSH048", "XY44", "BW01"), so the number alone finds them. */
export function pokemonPromoKey(number: string): string | null {
  return /^[a-z]+\d/i.test(number.trim()) ? `PROMO|${normalizeNumber(number)}` : null
}

/** A Pokémon card's price keys, most specific first: set code, set id ("swsh8"), then the promo number. */
export function pokemonKeys(setCode: string, setId: string, number: string): string[] {
  const keys = [pokemonKey(setCode, number), pokemonKey(setId, number)]
  const promo = pokemonPromoKey(number)
  if (promo) keys.push(promo)
  // Scarlet & Violet promos print "SVP 085" where the data says "SV085".
  if (/p$/i.test(setId)) keys.push(pokemonKey(setId, number.replace(/^[a-z]+/i, '')))
  return keys
}

/**
 * Yu-Gi-Oh!: the printed code without its region ("LOB-EN001" and "LOB-001" are the same slot),
 * plus the rarity when known.
 */
export function yugiohKey(setCode: string, number: string, rarity?: string | null): string {
  const tail = normalizeNumber(number.replace(/^(EN|E)(?=[A-Z0-9])/i, ''))
  const code = `${setCode.toUpperCase()}-${tail}`
  return rarity ? `${code}|${rarity.toLowerCase().replace(/[^a-z]/g, '')}` : code
}

/** The printed code exactly as printed ("LOB-E001" stays apart from "LOB-001"), with the rarity when known. */
export function yugiohExactKey(setCode: string, number: string, rarity?: string | null): string {
  const code = `=${setCode.toUpperCase()}-${number.toUpperCase()}`
  return rarity ? `${code}|${rarity.toLowerCase().replace(/[^a-z]/g, '')}` : code
}

/** A Yu-Gi-Oh! printing's price keys, most specific first. */
export function yugiohKeys(setCode: string, number: string, rarity?: string | null): string[] {
  return [yugiohExactKey(setCode, number, rarity), yugiohKey(setCode, number, rarity), yugiohExactKey(setCode, number), yugiohKey(setCode, number)]
}

/** A printed "LOB-EN001" split into set code and number. */
export function splitYugiohCode(code: string): [string, string] | null {
  const m = /^([A-Z0-9]+)-([A-Z]*\d+[A-Z]?)$/i.exec(code.trim())
  return m ? [m[1], m[2]] : null
}
