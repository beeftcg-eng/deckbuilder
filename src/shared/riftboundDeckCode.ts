import type { Card } from './types'

/**
 * Riftbound deck codes: the base32 string Riot's deck builders (and RiftAtlas) share a deck as. Like
 * Legends of Runeterra's, it's a version byte and then the cards grouped by copy count and set, each
 * card a set, a variant (regular, alternate art "a", Signature "s", promo "b") and its collector
 * number, with runes ("R01") and Spotlight cards ("SP1") flagged from version 4/5 on. Read the way
 * RiftAtlas's own decoder reads them, versions 1 to 6.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
/** The sets by their number in a code (riftbound-deck-codes' SET_MAP). */
const SETS = ['OGN', 'OGS', 'ARC', 'SFD', 'UNL', 'VEN', 'RAD']
const VARIANTS = ['', 'a', 's', 'b']

export interface DeckCodeEntry {
  /** "OGN-066", "UNL-229s", "VEN-R01", "VEN-SP1". */
  code: string
  count: number
}

export interface DecodedDeckCode {
  main: DeckCodeEntry[]
  sideboard: DeckCodeEntry[]
  /** A second Legend, for the decks that may have one (version 6). */
  extraLegends: string[]
}

class Reader {
  private at = 0
  private readonly bytes: Uint8Array
  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }
  byte(): number {
    if (this.at >= this.bytes.length) throw new Error('The deck code ends too soon')
    return this.bytes[this.at++]
  }
  varint(): number {
    let value = 0
    for (let shift = 0; shift < 35; shift += 7) {
      const b = this.byte()
      value += (b & 0x7f) * 2 ** shift
      if (!(b & 0x80)) return value
    }
    throw new Error('The deck code has a broken number')
  }
}

function base32Bytes(code: string): Uint8Array {
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of code.toUpperCase()) {
    const v = BASE32.indexOf(ch)
    if (v < 0) throw new Error(`Not a deck code: '${ch}'`)
    buffer = ((buffer << 5) | v) & 0xffff
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

/** One card: its set and variant, then its number, which from version 4 on says whether it's a rune or a Spotlight card. */
function readCard(r: Reader, set: number, variant: number, prefixed: boolean, spotlight: boolean): string {
  const setCode = SETS[set]
  const suffix = VARIANTS[variant]
  if (setCode === undefined || suffix === undefined) throw new Error('The deck code names a set this app doesn’t know')
  let number: string
  const flag = prefixed ? r.byte() : 0
  const n = r.varint()
  if (flag === 2 && spotlight) number = `SP${n}`
  else if (flag === 1) number = `R${String(n).padStart(2, '0')}`
  else if (flag === 0 || !spotlight) number = String(n).padStart(3, '0')
  else throw new Error('The deck code has a card number this app can’t read')
  return `${setCode}-${number}${suffix}`
}

/** Versions 1-4: copy counts from `max` down to 1, each with its groups of cards by set and variant. */
function readByCount(r: Reader, max: number, prefixed: boolean): DeckCodeEntry[] {
  const out: DeckCodeEntry[] = []
  for (let count = max; count >= 1; count--) {
    const groups = r.varint()
    for (let g = 0; g < groups; g++) {
      const cards = r.varint()
      const set = r.byte()
      const variant = r.byte()
      for (let c = 0; c < cards; c++) out.push({ code: readCard(r, set, variant, prefixed, false), count })
    }
  }
  return out
}

/** Versions 5+: only the copy counts the deck uses, each listed. */
function readCounts(r: Reader, prefixed: boolean): DeckCodeEntry[] {
  const out: DeckCodeEntry[] = []
  const counts = r.varint()
  for (let i = 0; i < counts; i++) {
    const count = r.varint()
    const groups = r.varint()
    for (let g = 0; g < groups; g++) {
      const cards = r.varint()
      const set = r.byte()
      const variant = r.byte()
      for (let c = 0; c < cards; c++) out.push({ code: readCard(r, set, variant, prefixed, true), count })
    }
  }
  return out
}

export function decodeDeckCode(code: string): DecodedDeckCode {
  const r = new Reader(base32Bytes(code.trim()))
  const header = r.byte()
  const format = header >> 4
  const version = header & 0x0f
  if (format !== 1 || version < 1 || version > 6) throw new Error(`Not a deck code this app can read (format ${format}, version ${version})`)
  if (version >= 5) {
    const prefixed = r.byte() === 1
    const main = readCounts(r, prefixed)
    const sideboard = readCounts(r, prefixed)
    return { main, sideboard, extraLegends: readChampionAndLegends(r, version, prefixed) }
  }
  const prefixed = version >= 4
  const main = readByCount(r, 12, prefixed)
  const sideboard = version >= 2 ? readByCount(r, 3, prefixed) : []
  return { main, sideboard, extraLegends: readChampionAndLegends(r, version, prefixed) }
}

/** Reads past the chosen Champion (version 3+; it's in the main deck too) and returns the extra Legends (version 6). */
function readChampionAndLegends(r: Reader, version: number, prefixed: boolean): string[] {
  const extra: string[] = []
  if (version >= 3 && r.byte() === 1) {
    const set = r.byte()
    const variant = r.byte()
    readCard(r, set, variant, prefixed, version >= 5)
  }
  if (version >= 6) {
    const n = r.varint()
    for (let i = 0; i < n; i++) {
      const set = r.byte()
      const variant = r.byte()
      extra.push(readCard(r, set, variant, prefixed, true))
    }
  }
  return extra
}

// ---------- into decklist text ----------

/** A card's code as its source id starts: "UNL-229s" -> "unl-229*" (riftcodex writes Signature as "*"). */
const sourceKey = (code: string) => code.toLowerCase().replace(/s$/, '*')
const sourcePrefix = (sourceId: string) => sourceId.toLowerCase().split('-').slice(0, 2).join('-')

const RUNE_DOMAINS = ['Fury', 'Calm', 'Mind', 'Body', 'Chaos', 'Order']

type Section = 'Legend' | 'MainDeck' | 'Battlefields' | 'Runes' | 'Sideboard'

/**
 * A deck code as decklist text the paste importer reads ("3 ogn-066-298 Ahri, Alluring" under
 * Legend:/MainDeck:/Battlefields:/Runes:/Sideboard:), each card as the exact printing when the catalog
 * has it; a variant the catalog lacks falls back to the regular printing. Runes are the Rune Deck's
 * count by domain ("8 Order Rune"), whichever printings the code names. Anything the catalog doesn't
 * have is left as its code, which the importer reports as not matched.
 */
export function deckCodeToText(code: string, cards: Iterable<Card>): string {
  const deck = decodeDeckCode(code)
  const byKey = new Map<string, Card>()
  for (const card of cards) {
    if (card.gameId !== 'riftbound') continue
    const key = sourcePrefix(card.sourceId)
    if (!byKey.has(key)) byKey.set(key, card)
  }
  const sections: Record<Section, string[]> = { Legend: [], MainDeck: [], Battlefields: [], Runes: [], Sideboard: [] }
  const runes = new Map<string, number>()
  const add = (entry: DeckCodeEntry, sideboard: boolean, legend = false) => {
    const key = sourceKey(entry.code)
    const card = byKey.get(key) ?? byKey.get(key.replace(/[a-z*]$/, ''))
    const numbered = /-R0([1-6])[a-z]?$/i.exec(entry.code)?.[1]
    const domain = card?.category === 'Rune' ? RUNE_DOMAINS.find((d) => card.name.startsWith(`${d} Rune`)) : numbered ? RUNE_DOMAINS[Number(numbered) - 1] : undefined
    if (domain && !sideboard) {
      runes.set(domain, (runes.get(domain) ?? 0) + entry.count)
      return
    }
    if (!card) {
      sections[sideboard ? 'Sideboard' : legend ? 'Legend' : 'MainDeck'].push(`${entry.count} ${entry.code}`)
      return
    }
    const section: Section = sideboard
      ? 'Sideboard'
      : legend || card.category === 'Legend'
        ? 'Legend'
        : card.category === 'Battlefield'
          ? 'Battlefields'
          : 'MainDeck'
    sections[section].push(`${entry.count} ${card.sourceId} ${card.name}`)
  }
  for (const entry of deck.main) add(entry, false)
  for (const legend of deck.extraLegends) add({ code: legend, count: 1 }, false, true)
  for (const entry of deck.sideboard) add(entry, true)
  sections.Runes = [...runes].map(([domain, count]) => `${count} ${domain} Rune`)
  return (Object.entries(sections) as [Section, string[]][])
    .filter(([, lines]) => lines.length > 0)
    .map(([heading, lines]) => [`${heading}:`, ...lines].join('\n'))
    .join('\n\n')
}
