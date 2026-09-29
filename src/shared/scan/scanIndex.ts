/**
 * A per-game index of the card catalog built for the scanner: every card's name as it's actually
 * printed (card data adds labels like "(Alternate Art)" or "(058)" that aren't on the card), a
 * trigram index to find names in noisy OCR text fast, and the printed codes (set + collector number,
 * One Piece's OP01-077, Yu-Gi-Oh!'s LOB-EN001 and passcode) that pin down one exact printing.
 */
import type { Card, GameId } from '../types'
import { squash, stripLeadingZeros, trigrams } from './text'

export interface NameEntry {
  id: number
  /** The printed name, readable. */
  display: string
  /** squash()ed name parts that are printed separately (Riftbound "Vi" + "Piltover Enforcer"), or just the name. */
  parts: string[]
  /** Every printing that carries this printed name. */
  printings: Card[]
}

/** A printing a code points at, and how specifically (1 = the code is exactly this printing's). */
export interface CodeTarget {
  card: Card
  weight: number
}

export interface ScanIndex {
  gameId: GameId
  names: NameEntry[]
  trigramToNames: Map<string, number[]>
  /** Game-specific printed-code keys (see codeKeys) -> printings. */
  byCode: Map<string, CodeTarget[]>
  /** Lowercase set codes printed on this game's cards, for fuzzy set-code reading. */
  setCodes: Set<string>
  /** Riftbound: a set's printed total ("/298") -> its set code, for promos and starters printed without their own. */
  setByTotal: Map<string, string>
  /** Pokémon: how many cards each set has, to tell "3/73" from "3/102". */
  setSize: Map<string, number>
  /** Name parts of 3 letters or fewer ("vi", "mel") -> names, since trigrams can't find those. */
  shortParts: Map<string, number[]>
  /** card id -> its name entry. */
  nameOfCard: Map<string, number>
}

/** The name as printed on the card: card data's extra labels removed. */
export function printedName(card: Card): string {
  let name = card.name
  if (card.gameId === 'onepiece' || card.gameId === 'riftbound') {
    name = name.replace(/\s*[([][^)\]]*[)\]]/g, '') // "(Alternate Art)", "(058)", "(Judge)", "[Finalist]"
    name = name.replace(/\s+-\s+(?:[A-Z]{1,4}\d{0,2}-)?[A-Z]?\d{2,3}\b.*$/, '') // One Piece "Carrot - P-070 ..."
  }
  return name.trim()
}

/** The collector number as printed, variant suffix included: Riftbound's "113a" (alternate art) or "229*" (signature). */
export function printedNumber(card: Card): string {
  if (card.gameId === 'riftbound') {
    const parts = card.sourceId.split('-')
    if (parts.length === 3 && /^\d/.test(parts[1])) return parts[1].replace(/^0+(?=\d)/, '')
  }
  return card.number
}

/** The printing's variant as the card data names it ("Alternate Art", "Signature", "Parallel", "Box Topper"), if any. */
export function variantName(card: Card): string | null {
  const labels = [...card.name.matchAll(/[([]([^)\]]*)[)\]]/g)].map((m) => m[1].trim()).filter((l) => l && !/^\d+$/.test(l) && !/^[A-Z]{1,4}\d{0,2}-\d{3}$/.test(l))
  return labels.length ? labels.join(' · ') : null
}

/** The labels card data adds in brackets ("SP", "Championship 2024 Finals 3rd Place") - a few are printed on the card too. */
export function variantLabels(card: Card): string[] {
  return [...card.name.matchAll(/[([]([^)\]]*)[)\]]/g)]
    .flatMap((m) => [squash(m[1]), ...m[1].split(/\s+/).map(squash)])
    .filter((l) => l.length >= 2 && !/^\d+$/.test(l))
}

/** The parts of a printed name that appear on separate lines of the card. */
export function nameParts(card: Card, name: string): string[] {
  if (card.gameId === 'riftbound') {
    // "Vi - Piltover Enforcer", "Kennen, Storm of Shuriken": champion name and title are printed apart.
    const split = name.split(/\s+-\s+|,\s+/)
    if (split.length > 1) return split.map(squash).filter(Boolean)
  }
  if (card.gameId === 'mtg' && name.includes(' // ')) return [squash(name.split(' // ')[0])] // the front face is what's printed on the front
  return [squash(name)]
}

/** Riftbound's source id "unl-229*-219" -> number with variant suffix ("229*") and set total ("219"). */
function riftboundNumber(card: Card): { number: string; plain: string; total: string | null } {
  const parts = card.sourceId.split('-')
  const plain = stripLeadingZeros(card.number.toLowerCase())
  if (parts.length === 3) return { number: stripLeadingZeros(parts[1].toLowerCase()), plain, total: stripLeadingZeros(parts[2]) }
  return { number: plain, plain, total: null }
}

/**
 * Keys under which a printing can be found from codes read off the card, with how specific each is.
 * Mirrors evidence.ts's reading. A key without a variant's suffix ("229" for the "229*" signature
 * printing) still finds it, but ranks below the printing whose code it is exactly.
 */
export function codeKeys(card: Card, setByTotal?: Map<string, string>): [string, number][] {
  const set = card.setCode.toLowerCase()
  const number = stripLeadingZeros(card.number.toLowerCase())
  switch (card.gameId) {
    case 'riftbound': {
      const { number: withSuffix, plain, total } = riftboundNumber(card)
      const suffixed = withSuffix !== plain
      const sets = [set]
      // Promos and starter cards are printed with the set their total belongs to ("OGN · 218/298").
      const printedSet = total ? setByTotal?.get(total) : undefined
      if (printedSet && printedSet !== set) sets.push(printedSet)
      const keys: [string, number][] = []
      for (const s of sets) {
        const own = s === set ? 1 : 0.95
        if (total) keys.push([`${s}:${withSuffix}/${total}`, own])
        keys.push([`${s}:${withSuffix}`, own])
        if (suffixed) {
          if (total) keys.push([`${s}:${plain}/${total}`, own * 0.7])
          keys.push([`${s}:${plain}`, own * 0.7])
        }
      }
      if (total) keys.push([`total:${withSuffix}/${total}`, 0.9])
      return keys
    }
    case 'onepiece':
      return [[`code:${card.sourceId.toLowerCase()}`, 1]]
    case 'pokemon':
      return [
        [`${set}:${number}`, 1],
        [`num:${number}`, 1],
      ]
    case 'yugioh': {
      // Every printing of a card shares its passcode: it pins the card, the set code pins the printing.
      const keys: [string, number][] = [[`pass:${stripLeadingZeros(card.sourceId)}`, 0.7]]
      if (card.number) keys.push([`set:${set}-${card.number.toLowerCase()}`, 1])
      return keys
    }
    case 'mtg': {
      const keys: [string, number][] = [[`${set}:${number}`, 1]]
      const plain = number.replace(/[^0-9]+$/, '')
      // Promo printings ("PMID 149p", "PAFR 78a") carry the main set's code and plain number on the card itself:
      // the text can't tell them from the regular printing, so they tie with it (the regular one a hair ahead)
      // and the picture decides - a promo has a stamp.
      if (plain !== number) keys.push([`${set}:${plain}`, 0.97])
      if (set.length >= 4 && set.startsWith('p')) keys.push([`${set.slice(1)}:${plain}`, 0.97])
      return keys
    }
  }
}

export function buildScanIndex(gameId: GameId, cards: readonly Card[]): ScanIndex {
  const byName = new Map<string, NameEntry>()
  const byCode = new Map<string, CodeTarget[]>()
  const setCodes = new Set<string>()
  const setSize = new Map<string, number>()
  const setByTotal = new Map<string, string>()
  const nameOfCard = new Map<string, number>()

  if (gameId === 'riftbound') {
    // A main set's total is the one most of its cards print; promo/starter printings borrow it.
    const votes = new Map<string, Map<string, number>>()
    for (const card of cards) {
      const { total } = riftboundNumber(card)
      if (!total || card.setCode === 'OPP') continue
      const byTotal = votes.get(total) ?? new Map<string, number>()
      byTotal.set(card.setCode.toLowerCase(), (byTotal.get(card.setCode.toLowerCase()) ?? 0) + 1)
      votes.set(total, byTotal)
    }
    for (const [total, counts] of votes) setByTotal.set(total, [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0])
  }

  const file = (card: Card, display: string) => {
    const key = squash(display)
    if (!key) return
    let entry = byName.get(key)
    if (!entry) {
      entry = { id: byName.size, display, parts: nameParts(card, display), printings: [] }
      byName.set(key, entry)
    }
    entry.printings.push(card)
    if (!nameOfCard.has(card.id)) nameOfCard.set(card.id, entry.id)
  }
  for (const card of cards) {
    file(card, printedName(card))
    // Magic's Secret Lair / Universes Beyond printings show another name on the card ("Shadowbringers").
    for (const flavor of card.flavorNames ?? []) file(card, flavor)
    for (const [k, weight] of codeKeys(card, setByTotal)) {
      const list = byCode.get(k)
      const existing = list?.find((t) => t.card.id === card.id)
      if (existing) existing.weight = Math.max(existing.weight, weight)
      else if (list) list.push({ card, weight })
      else byCode.set(k, [{ card, weight }])
    }
    const set = card.setCode.toLowerCase()
    if (card.setCode && card.setCode !== '—') setCodes.add(set)
    setSize.set(set, (setSize.get(set) ?? 0) + 1)
  }
  const names = [...byName.values()]
  const shortParts = new Map<string, number[]>()
  for (const entry of names) {
    for (const part of entry.parts) {
      if (part.length > 3) continue
      const list = shortParts.get(part)
      if (list) list.push(entry.id)
      else shortParts.set(part, [entry.id])
    }
  }
  const trigramToNames = new Map<string, number[]>()
  for (const entry of names) {
    const seen = new Set<string>()
    for (const part of entry.parts) {
      for (const tri of trigrams(part)) {
        if (seen.has(tri)) continue
        seen.add(tri)
        const list = trigramToNames.get(tri)
        if (list) list.push(entry.id)
        else trigramToNames.set(tri, [entry.id])
      }
    }
  }
  return { gameId, names, trigramToNames, byCode, setCodes, setByTotal, setSize, shortParts, nameOfCard }
}
