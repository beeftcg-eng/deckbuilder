/**
 * Reads printed codes off OCR lines: set codes, collector numbers, One Piece card codes, Yu-Gi-Oh!
 * set codes and passcodes, promo numbers. Every key produced here has the same shape as the ones
 * scanIndex.ts's codeKeys() files printings under. OCR swaps look-alike characters (0/O, 1/I, 5/S,
 * 8/B) and glues neighbouring text on, so the patterns are deliberately forgiving and every key is
 * checked against the catalog before it counts.
 */
import type { GameId } from '../types'
import type { ScanIndex } from './scanIndex'
import { digitsFromOcr, levenshtein, lettersFromOcr, stripLeadingZeros } from './text'

export interface OcrLine {
  text: string
  /** Recogniser confidence, 0..1. */
  conf: number
  /** Axis-aligned box as fractions of the scanned image (0..1). */
  box: { x: number; y: number; w: number; h: number }
  /** Height of the text itself as a fraction of the image height (a rotated line's box is taller). */
  textHeight?: number
}

export interface CodeHit {
  key: string
  /** How sure the reading is: 1 = a full code (set + number + total), lower for partial ones. */
  weight: number
}

export interface Evidence {
  codes: CodeHit[]
  /** Collector numbers read without a set (weak: only used to choose between printings of a matched name). */
  numbers: string[]
  /** "number/total" readings (Pokémon), for telling sets apart by size. */
  totals: { number: string; total: number }[]
  /** Set codes recognised anywhere on the card. */
  sets: string[]
  /** Magic's printed rarity letter (C, U, R, M, S, T, P = promo), when read next to the collector number. */
  rarityLetters: string[]
}

const D = '[0-9OoIlSsBQDZ|]' // a digit as OCR might read it

/** The known set code closest to what OCR read (one slip allowed for 3+ characters), else null. */
export function resolveSetCode(raw: string, index: ScanIndex): string | null {
  const read = raw.toLowerCase()
  if (index.setCodes.has(read)) return read
  const variants = [lettersFromOcr(read), digitsFromOcr(read)]
  for (const v of variants) if (index.setCodes.has(v)) return v
  if (read.length < 3) return null
  let best: string | null = null
  let bestD = 2
  let ambiguous = false
  for (const code of index.setCodes) {
    if (Math.abs(code.length - read.length) > 1) continue
    const d = Math.min(levenshtein(read, code, 1), levenshtein(variants[0], code, 1))
    if (d < bestD) {
      bestD = d
      best = code
      ambiguous = false
    } else if (d === bestD) ambiguous = true
  }
  return bestD <= 1 && !ambiguous ? best : null
}

function num(raw: string): string {
  return stripLeadingZeros(digitsFromOcr(raw))
}

function add(out: Evidence, key: string, weight: number) {
  const existing = out.codes.find((c) => c.key === key)
  if (existing) existing.weight = Math.max(existing.weight, weight)
  else out.codes.push({ key, weight })
}

function riftbound(text: string, index: ScanIndex, out: Evidence) {
  // "SFD · 086/221", "UNL - 229*/219", "VEN · 084a/166 · EN", "021/024" (starters print no set)
  const re = new RegExp(`(?:([A-Za-z0-9]{3})\\s*[^A-Za-z0-9\\s]?\\s*)?(?<![0-9])(${D}{2,3})([a-zA-Z*★]?)\\s*[/|]\\s*(${D}{1}\\.?${D}{1,2})`, 'g')
  for (const m of text.matchAll(re)) {
    const n = num(m[2])
    const suffix = m[3] === '★' ? '*' : m[3].toLowerCase()
    const total = num(m[4].replace('.', ''))
    if (!/^\d+$/.test(n) || !/^\d+$/.test(total)) continue
    out.numbers.push(n)
    const set = (m[1] && resolveSetCode(m[1], index)) || index.setByTotal.get(total) || null
    add(out, `total:${n}${suffix}/${total}`, 0.9)
    if (!set) continue
    out.sets.push(set)
    add(out, `${set}:${n}${suffix}/${total}`, 1)
    add(out, `${set}:${n}${suffix}`, 0.9)
  }
}

function onepiece(text: string, out: Evidence) {
  // "OP06-093", misread as "0P06-093E3", "3T07-001E8", "STO1-0068", "SP OP07-118 SE"
  const prefixes = '(?:O|0|Q)P|(?:S|5|3)T|E(?:B|8)|PRB|PR8'
  const re = new RegExp(`(${prefixes})\\s*-?\\s*(${D}{2})\\s*-\\s*(${D}{3})`, 'gi')
  for (const m of text.matchAll(re)) {
    const prefix = m[1].toUpperCase().replace(/^[0Q]P$/, 'OP').replace(/^[53]T$/, 'ST').replace(/^E8$/, 'EB').replace('PR8', 'PRB')
    const code = `${prefix.toLowerCase()}${digitsFromOcr(m[2])}-${digitsFromOcr(m[3])}`
    if (/^[a-z]+\d{2}-\d{3}$/.test(code)) add(out, `code:${code}`, 1)
  }
  for (const m of text.matchAll(new RegExp(`(?<![A-Za-z])P\\s*-\\s*(${D}{3})`, 'g'))) {
    const code = `p-${digitsFromOcr(m[1])}`
    if (/^p-\d{3}$/.test(code)) add(out, `code:${code}`, 1)
  }
}

const POKEMON_PROMO = /\b(SWSH|SM|XY|BW|SVP|SV|DP|HGSS|TG|GG|RC|SH)\s*-?\s*(?:EN\s*)?([0-9OIl]{1,3})\b/gi

function pokemon(text: string, index: ScanIndex, out: Evidence) {
  const sets: string[] = []
  for (const m of text.matchAll(/\b([A-Z]{3})\s*(?:EN)\b/g)) {
    const set = resolveSetCode(m[1], index)
    if (set) sets.push(set)
  }
  out.sets.push(...sets)
  for (const m of text.matchAll(new RegExp(`(?<![0-9A-Za-z])(${D}{1,3})\\s*[/|]\\s*(${D}{2,3})(?![0-9])`, 'g'))) {
    const n = num(m[1])
    const total = num(m[2])
    if (!/^\d+$/.test(n) || !/^\d+$/.test(total)) continue
    out.numbers.push(n)
    out.totals.push({ number: n, total: Number(total) })
    add(out, `num:${n}`, 0.6)
    for (const set of sets) add(out, `${set}:${n}`, 1)
  }
  for (const m of text.matchAll(POKEMON_PROMO)) {
    let prefix = m[1].toLowerCase()
    const digits = digitsFromOcr(m[2])
    if (!/^\d+$/.test(digits)) continue
    if (prefix === 'svp') prefix = 'sv'
    // Catalog numbers keep the printed zero padding ("SWSH048", "SV085", "TG12"); try the likely widths.
    for (const width of [digits.length, 2, 3]) add(out, `num:${prefix}${digits.padStart(width, '0')}`, 0.9)
  }
}

function yugioh(text: string, index: ScanIndex, out: Evidence) {
  // Set code "LOB-EN001", "SDY-006", "MP21-EN144", "RA03-EN027"
  for (const m of text.matchAll(new RegExp(`\\b([A-Z0-9]{2,5})\\s*-\\s*([A-Z]{0,2})\\s*([A-Z]?${D}{2,3})`, 'g'))) {
    const set = resolveSetCode(m[1], index)
    if (!set) continue
    out.sets.push(set)
    const lang = lettersFromOcr(m[2])
    const tail = m[3].toLowerCase()
    const number = /^[a-z]/.test(tail) && tail.length === 4 ? tail[0] + digitsFromOcr(tail.slice(1)) : digitsFromOcr(tail)
    add(out, `set:${set}-${lang}${number}`, 1)
    if (lang === 'en' || lang === '') add(out, `set:${set}-en${number}`, 0.9)
  }
  // Passcode: 8 digits at the bottom left.
  for (const m of text.matchAll(new RegExp(`(?<![0-9A-Za-z])(${D}{8})(?![0-9A-Za-z])`, 'g'))) {
    const digits = digitsFromOcr(m[1])
    if (/^\d{8}$/.test(digits)) add(out, `pass:${stripLeadingZeros(digits)}`, 1)
  }
}

function mtg(text: string, index: ScanIndex, out: Evidence, numbers: string[]) {
  for (const m of text.matchAll(/\b([A-Z0-9]{3,5})\s*[•·.*+-]?\s*(?:EN|ES|FR|DE|IT|PT|JA|JP)\b/g)) {
    const set = resolveSetCode(m[1], index)
    if (set) out.sets.push(set)
  }
  // "053/199 C", "U 0019", "0280 R", a bare "835". Not "2/2": power/toughness looks like a number too.
  const re = new RegExp(`(?:\\b[CURMSLTP]\\s+(${D}{3,4})\\b)|(?:(?<![0-9/])(${D}{3,4})\\s*/\\s*${D}{3,4}\\b)|(?:\\b(${D}{3,4})\\s*[CURMSLTP]\\b)|(?:^\\s*(\\d{3,4})\\s*$)`, 'g')
  for (const m of text.matchAll(re)) {
    const n = num(m[1] ?? m[2] ?? m[3] ?? m[4])
    if (/^\d+$/.test(n)) numbers.push(n)
  }
  // The rarity letter printed beside the number: "U 0019", "0280 R", "187/264 P".
  for (const m of text.matchAll(new RegExp(`(?:\\b([CURMSTP])\\s+${D}{3,4}\\b)|(?:${D}{3,4}(?:\\s*/\\s*${D}{3,4})?\\s+([CURMSTP])\\b)`, 'g'))) {
    out.rarityLetters.push(m[1] ?? m[2])
  }
}

/** Every code the lines contain. Lines on the same row are read joined too, since codes can break across boxes. */
export function extractEvidence(gameId: GameId, lines: readonly OcrLine[], index: ScanIndex): Evidence {
  const out: Evidence = { codes: [], numbers: [], totals: [], sets: [], rarityLetters: [] }
  const texts = lines.map((l) => l.text)
  const rows: string[] = []
  const sorted = [...lines].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x)
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j]
      if (Math.abs(b.box.y + b.box.h / 2 - (a.box.y + a.box.h / 2)) > Math.max(a.box.h, b.box.h) * 0.6) continue
      const [left, right] = a.box.x <= b.box.x ? [a, b] : [b, a]
      rows.push(`${left.text} ${right.text}`)
    }
  }
  const mtgNumbers: string[] = []
  for (const text of [...texts, ...rows]) {
    switch (gameId) {
      case 'riftbound':
        riftbound(text, index, out)
        break
      case 'onepiece':
        onepiece(text, out)
        break
      case 'pokemon':
        pokemon(text, index, out)
        break
      case 'yugioh':
        yugioh(text, index, out)
        break
      case 'mtg':
        mtg(text, index, out, mtgNumbers)
        break
    }
  }
  if (gameId === 'mtg') {
    out.numbers.push(...mtgNumbers)
    for (const set of new Set(out.sets)) for (const n of new Set(mtgNumbers)) add(out, `${set}:${n}`, 1)
  }
  out.numbers = [...new Set(out.numbers)]
  out.sets = [...new Set(out.sets)]
  out.rarityLetters = [...new Set(out.rarityLetters)]
  // Only keys that exist in the catalog are worth anything.
  out.codes = out.codes.filter((c) => index.byCode.has(c.key))
  return out
}
