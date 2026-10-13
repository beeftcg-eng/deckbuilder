import type { Card, Deck } from './types'
import { chosenChampionId } from './games/riftbound'

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
  /** The chosen Champion (version 3+), which is in `main` too. */
  champion?: string
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
    return { main, sideboard, ...readChampionAndLegends(r, version, prefixed) }
  }
  const prefixed = version >= 4
  const main = readByCount(r, 12, prefixed)
  const sideboard = version >= 2 ? readByCount(r, 3, prefixed) : []
  return { main, sideboard, ...readChampionAndLegends(r, version, prefixed) }
}

/** The chosen Champion (version 3+) and the extra Legends (version 6). */
function readChampionAndLegends(r: Reader, version: number, prefixed: boolean): { extraLegends: string[]; champion?: string } {
  const extra: string[] = []
  let champion: string | undefined
  if (version >= 3 && r.byte() === 1) {
    const set = r.byte()
    const variant = r.byte()
    champion = readCard(r, set, variant, prefixed, version >= 5)
  }
  if (version >= 6) {
    const n = r.varint()
    for (let i = 0; i < n; i++) {
      const set = r.byte()
      const variant = r.byte()
      extra.push(readCard(r, set, variant, prefixed, true))
    }
  }
  return { extraLegends: extra, ...(champion ? { champion } : {}) }
}

// ---------- into decklist text ----------

/** A card's code as its source id starts: "UNL-229s" -> "unl-229*" (riftcodex writes Signature as "*"). */
const sourceKey = (code: string) => code.toLowerCase().replace(/s$/, '*')
const sourcePrefix = (sourceId: string) => sourceId.toLowerCase().split('-').slice(0, 2).join('-')

/** Riftbound cards by their code's start ("ogn-066a"), for cardForCode. */
export function codeIndex(cards: Iterable<Card>): Map<string, Card> {
  const byKey = new Map<string, Card>()
  for (const card of cards) {
    if (card.gameId !== 'riftbound') continue
    const key = sourcePrefix(card.sourceId)
    if (!byKey.has(key)) byKey.set(key, card)
  }
  return byKey
}

/** The card a code names ("OGN-066a", "VEN-155"): that printing, else the regular one. */
export function cardForCode(index: Map<string, Card>, code: string): Card | undefined {
  const key = sourceKey(code)
  return index.get(key) ?? index.get(key.replace(/[a-z*]$/, ''))
}

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
  const byKey = codeIndex(cards)
  const sections: Record<Section, string[]> = { Legend: [], MainDeck: [], Battlefields: [], Runes: [], Sideboard: [] }
  const runes = new Map<string, number>()
  const add = (entry: DeckCodeEntry, sideboard: boolean, legend = false) => {
    const card = cardForCode(byKey, entry.code)
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

// ---------- out of a deck ----------

/** Each Rune Deck domain as Origins' rune, the printing a code names it by. */
const RUNE_CODES: Record<string, string> = { Fury: 'OGN-007', Calm: 'OGN-042', Mind: 'OGN-089', Body: 'OGN-126', Chaos: 'OGN-166', Order: 'OGN-214' }

/** A card's code from its source id ("unl-229*-219" -> "UNL-229s", "ven-r01" -> "VEN-R01"), or null for a set or variant codes can't name. */
export function cardCode(card: Card): string | null {
  const m = /^([a-z]+)-((?:r|sp)?)(\d+)([a-z*]?)(?:-\d+)?$/i.exec(card.sourceId)
  if (!m) return null
  const set = m[1].toUpperCase()
  const variant = m[4] === '*' ? 's' : m[4].toLowerCase()
  if (!SETS.includes(set) || !VARIANTS.includes(variant)) return null
  const prefix = m[2].toUpperCase()
  const number = prefix === 'SP' ? `SP${Number(m[3])}` : prefix === 'R' ? `R${m[3].padStart(2, '0')}` : m[3].padStart(3, '0')
  return `${set}-${number}${variant}`
}

class Writer {
  readonly bytes: number[] = []
  byte(b: number) {
    this.bytes.push(b & 0xff)
  }
  varint(n: number) {
    do {
      let b = n & 0x7f
      n = Math.floor(n / 128)
      if (n > 0) b |= 0x80
      this.byte(b)
    } while (n > 0)
  }
}

interface ParsedCode {
  set: number
  variant: number
  prefix: '' | 'R' | 'SP'
  n: number
}

function parseCode(code: string): ParsedCode {
  const m = /^([A-Z]+)-(R|SP)?(\d+)([a-z]?)$/.exec(code)
  const set = m ? SETS.indexOf(m[1]) : -1
  const variant = m ? VARIANTS.indexOf(m[4]) : -1
  if (!m || set < 0 || variant < 0) throw new Error(`Not a card code: ${code}`)
  return { set, variant, prefix: (m[2] ?? '') as ParsedCode['prefix'], n: Number(m[3]) }
}

/** The entries with `count` copies, grouped by set and variant in code order, each group's numbers in order. */
function groupsOf(entries: DeckCodeEntry[], count: number): { set: number; variant: number; cards: ParsedCode[] }[] {
  const groups = new Map<string, { set: number; variant: number; cards: ParsedCode[] }>()
  for (const e of entries) {
    if (e.count !== count) continue
    const p = parseCode(e.code)
    const key = `${p.set}-${p.variant}`
    const group = groups.get(key) ?? groups.set(key, { set: p.set, variant: p.variant, cards: [] }).get(key)!
    group.cards.push(p)
  }
  const numberKey = (p: ParsedCode) => `${p.prefix}${p.n}`
  return [...groups.values()]
    .sort((a, b) => a.set - b.set || a.variant - b.variant)
    .map((g) => ({ ...g, cards: g.cards.sort((a, b) => numberKey(a).localeCompare(numberKey(b), undefined, { numeric: true })) }))
}

function writeNumber(w: Writer, p: ParsedCode, flagged: boolean) {
  if (flagged) w.byte(p.prefix === 'SP' ? 2 : p.prefix === 'R' ? 1 : 0)
  w.varint(p.n)
}

/**
 * A deck code for these cards, written the way RiftAtlas's encoder writes it: the oldest version that
 * can hold the deck (3, or 4 with rune numbers, 5 for Spotlight cards or more than 12 copies of a card),
 * then the chosen Champion if there is one.
 */
export function encodeDeckCode(main: DeckCodeEntry[], sideboard: DeckCodeEntry[] = [], champion?: string): string {
  const all = [...main, ...sideboard, ...(champion ? [{ code: champion, count: 1 }] : [])]
  const parsed = all.map((e) => parseCode(e.code))
  const hasRune = parsed.some((p) => p.prefix === 'R')
  const hasSpotlight = parsed.some((p) => p.prefix === 'SP')
  const maxMain = Math.max(0, ...main.map((e) => e.count))
  const maxSide = Math.max(0, ...sideboard.map((e) => e.count))
  const version = maxMain > 12 || maxSide > 3 || hasSpotlight ? 5 : hasRune ? 4 : 3
  const flagged = hasRune || hasSpotlight
  const w = new Writer()
  w.byte(0x10 | version)
  if (version >= 5) {
    w.byte(flagged ? 1 : 0)
    for (const entries of [main, sideboard]) {
      const counts = [...new Set(entries.map((e) => e.count))].sort((a, b) => b - a)
      w.varint(counts.length)
      for (const count of counts) {
        w.varint(count)
        const groups = groupsOf(entries, count)
        w.varint(groups.length)
        for (const g of groups) {
          w.varint(g.cards.length)
          w.byte(g.set)
          w.byte(g.variant)
          for (const p of g.cards) writeNumber(w, p, flagged)
        }
      }
    }
  } else {
    for (const [entries, max] of [[main, 12], [sideboard, 3]] as const) {
      for (let count = max; count >= 1; count--) {
        const groups = groupsOf(entries, count)
        w.varint(groups.length)
        for (const g of groups) {
          w.varint(g.cards.length)
          w.byte(g.set)
          w.byte(g.variant)
          for (const p of g.cards) writeNumber(w, p, version >= 4)
        }
      }
    }
  }
  // The chosen Champion, which is in the main deck too.
  if (champion) {
    const p = parseCode(champion)
    w.byte(1)
    w.byte(p.set)
    w.byte(p.variant)
    writeNumber(w, p, flagged)
  } else w.byte(0)
  let out = ''
  let buffer = 0
  let bits = 0
  for (const b of w.bytes) {
    buffer = ((buffer << 8) | b) & 0xffff
    bits += 8
    while (bits >= 5) {
      bits -= 5
      out += BASE32[(buffer >> bits) & 31]
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31]
  return out
}

/** A card's name without the printing note ("Teemo - Strategist (Alternate Art)" -> "teemo - strategist"). */
const baseName = (card: Card) => card.name.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()

/**
 * A Riftbound deck as a deck code. A printing a code can't name (a promo set, an Organized Play
 * printing) is written as a printing of the same card it can; runes as Origins' rune of their domain.
 * Throws, naming them, if some cards have no printing a code can name.
 */
export function deckToCode(deck: Pick<Deck, 'zones' | 'freeTextZones'>, cardsById: Map<string, Card>): string {
  const byName = new Map<string, Card[]>()
  for (const card of cardsById.values()) {
    if (card.gameId !== 'riftbound' || !cardCode(card)) continue
    const list = byName.get(baseName(card)) ?? byName.set(baseName(card), []).get(baseName(card))!
    list.push(card)
  }
  const unnamed: string[] = []
  const codeFor = (card: Card): string | null => {
    const own = cardCode(card)
    if (own) return own
    // Another printing of the same card, the regular one first.
    const other = (byName.get(baseName(card)) ?? []).map(cardCode).filter((c): c is string => !!c)
    return other.find((c) => /\d$/.test(c)) ?? other[0] ?? null
  }
  const add = (target: Map<string, number>, code: string, quantity: number) => target.set(code, (target.get(code) ?? 0) + quantity)
  const main = new Map<string, number>()
  const sideboard = new Map<string, number>()
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    for (const { cardId, quantity } of entries) {
      const card = cardsById.get(cardId)
      if (!card || quantity <= 0) continue
      const code = codeFor(card)
      if (!code) unnamed.push(card.name)
      else add(zoneId === 'sideboard' ? sideboard : main, code, quantity)
    }
  }
  for (const { label, quantity } of deck.freeTextZones.runes ?? []) if (quantity > 0 && RUNE_CODES[label]) add(main, RUNE_CODES[label], quantity)
  if (unnamed.length) throw new Error(`No deck code for ${[...new Set(unnamed)].join(', ')}`)
  const entries = (m: Map<string, number>) => [...m].map(([code, count]) => ({ code, count }))
  const legend = cardsById.get(deck.zones.legend?.[0]?.cardId ?? '')
  const championId = chosenChampionId(deck as Deck, cardsById, legend)
  const champion = championId ? cardsById.get(championId) : undefined
  return encodeDeckCode(entries(main), entries(sideboard), (champion && codeFor(champion)) ?? undefined)
}
