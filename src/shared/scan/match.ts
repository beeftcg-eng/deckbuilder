/**
 * Turns OCR lines into a ranked list of printings: the printed name (fuzzy, weighted towards the big
 * text a name is printed in, where that game prints it) narrows it to a card, and the printed set
 * code / collector number picks the printing. Printings that still tie (alternate arts sharing a
 * number) are separated afterwards by comparing the picture (visual.ts).
 */
import type { Card, GameId } from '../types'
import { extractEvidence, type Evidence, type OcrLine } from './evidence'
import { variantLabels, type NameEntry, type ScanIndex } from './scanIndex'
import { levenshtein, normalize, squash, stripLeadingZeros, substringDistance, trigrams } from './text'

export interface Candidate {
  card: Card
  score: number
  /** How well the printed name matched (0..1), 0 if it only came from a code. */
  nameScore: number
  /** The strongest printed code that points at this printing (0 = none). */
  codeWeight: number
  numberMatch: boolean
  setMatch: boolean
}

export type MatchStatus = 'exact' | 'name' | 'unsure' | 'none'

export interface MatchResult {
  status: MatchStatus
  candidates: Candidate[]
  evidence: Evidence
  /** The best name entry, when a name was recognised. */
  name: NameEntry | null
}

interface PreparedLine {
  s: string
  words: string[]
  weight: number
  /** Two neighbouring lines joined: scored against, but not used to look names up (that doubles the work for little gain). */
  joined?: boolean
}

/** Where each game prints the card name (y of the line's middle, 0 = top of the scan), as a weight. */
function positionWeight(gameId: GameId, y: number): number {
  switch (gameId) {
    case 'mtg':
    case 'yugioh':
      return y < 0.17 ? 1 : 0.82
    case 'pokemon':
      return y < 0.17 ? 1 : 0.86
    case 'onepiece':
      return y > 0.7 ? 1 : 0.86
    default:
      return 1 // Riftbound moves its name around by card type
  }
}

function prepare(gameId: GameId, lines: readonly OcrLine[]): PreparedLine[] {
  const heights = lines.map((l) => l.textHeight ?? l.box.h)
  const maxH = Math.max(1e-6, ...heights)
  const usable = lines
    .map((l, i) => ({ line: l, prom: heights[i] / maxH }))
    .filter((l) => l.line.conf >= 0.3 && squash(l.line.text).length >= 2)
  const weightOf = (l: OcrLine, prom: number) => (0.75 + 0.25 * prom) * (0.8 + 0.2 * l.conf) * positionWeight(gameId, l.box.y + l.box.h / 2)
  const out: PreparedLine[] = usable.map(({ line, prom }) => ({ s: squash(line.text), words: normalize(line.text).split(' '), weight: weightOf(line, prom) }))
  // Names printed over two lines ("Alolan" / "Sandslash", "Memory" / "Berry"): neighbouring lines joined.
  const ordered = [...usable].sort((a, b) => a.line.box.y - b.line.box.y || a.line.box.x - b.line.box.x)
  for (let i = 0; i + 1 < ordered.length; i++) {
    for (let j = i + 1; j < Math.min(ordered.length, i + 3); j++) {
      const a = ordered[i]
      const b = ordered[j]
      const gap = b.line.box.y - (a.line.box.y + a.line.box.h)
      if (gap > Math.max(a.line.box.h, b.line.box.h) * 1.2) continue
      // As prominent as its bigger half: "Alolan" is small print, but it's part of the name printed big beside it.
      const weight = Math.max(weightOf(a.line, a.prom), weightOf(b.line, b.prom))
      for (const [x, y] of [
        [a, b],
        [b, a],
      ]) {
        const text = `${x.line.text} ${y.line.text}`
        out.push({ s: squash(text), words: normalize(text).split(' '), weight, joined: true })
      }
    }
  }
  return out
}

/** How well one printed name part matches one OCR line, 0..1. */
export function partSimilarity(part: string, line: string, words: readonly string[] = []): number {
  // "Vi", "Mew", "Mel": the whole line, or a whole word of it ("LEGEND MEL").
  if (part.length <= 3) return part === line ? 1 : words.includes(part) ? 0.95 : 0
  const longest = Math.max(part.length, line.length)
  const full = 1 - levenshtein(part, line, Math.ceil(longest * 0.4)) / longest
  if (line.length <= part.length) return Math.max(0, full)
  const coverage = part.length / line.length
  const sub = 1 - substringDistance(part, line) / part.length - 0.2 * (1 - coverage)
  return Math.max(0, full, sub)
}

function scoreNames(prepared: PreparedLine[], index: ScanIndex, codeCards: readonly Card[]): Map<number, number> {
  // Candidate names: the ones sharing the most trigrams with some line.
  const candidates = new Set<number>()
  const shortWords = new Set<string>()
  for (const line of prepared) {
    if (line.joined) continue
    const counts = new Map<number, number>()
    for (const tri of new Set(trigrams(line.s))) {
      const ids = index.trigramToNames.get(tri)
      if (!ids || ids.length > 4000) continue // trigrams in thousands of names say nothing
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    for (const [id, count] of top) if (count >= 2 || line.s.length <= 4) candidates.add(id)
    for (const w of line.words) if (w.length >= 2 && w.length <= 3) shortWords.add(w)
    if (line.s.length <= 3) shortWords.add(line.s)
  }
  // Short name parts ("Vi", "Mel") have too few trigrams to be found that way; look for them directly.
  for (const w of shortWords) for (const id of index.shortParts.get(w) ?? []) candidates.add(id)
  // A card a printed code points at gets its name checked even if the name search didn't turn it up.
  for (const card of codeCards) {
    const id = index.nameOfCard.get(card.id)
    if (id != null) candidates.add(id)
  }
  const scores = new Map<number, number>()
  for (const id of candidates) {
    const score = scoreEntry(index.names[id], prepared)
    if (score >= 0.55) scores.set(id, score)
  }
  return scores
}

/** One name's match against the lines: its parts' best matches, weighted by part length. */
function scoreEntry(entry: NameEntry, prepared: PreparedLine[]): number {
  {
    let total = 0
    let length = 0
    for (const part of entry.parts) {
      let best = 0
      for (const line of prepared) {
        const sim = partSimilarity(part, line.s, line.words) * line.weight
        if (sim > best) best = sim
      }
      total += best * part.length
      length += part.length
    }
    const score = length ? total / length : 0
    // A longer name that matched just as well explains more of the card ("Mel - Soul's Reflection" over "Soul's Reflection").
    return score + Math.min(0.03, length * 0.001)
  }
}

function cardNumber(card: Card): string {
  return stripLeadingZeros(card.number.toLowerCase())
}

export function identify(lines: readonly OcrLine[], index: ScanIndex): MatchResult {
  const evidence = extractEvidence(index.gameId, lines, index)
  const codeCards = evidence.codes.flatMap((hit) => (index.byCode.get(hit.key) ?? []).map((t) => t.card))
  const nameScores = scoreNames(prepare(index.gameId, lines), index, codeCards)
  const codeWeight = new Map<string, number>() // card id -> best code weight
  for (const hit of evidence.codes) {
    for (const target of index.byCode.get(hit.key) ?? []) {
      codeWeight.set(target.card.id, Math.max(codeWeight.get(target.card.id) ?? 0, hit.weight * target.weight))
    }
  }
  const numbers = new Set(evidence.numbers)
  const sets = new Set(evidence.sets)
  const fullText = squash(lines.map((l) => l.text).join(' '))
  const byId = new Map<string, Candidate>()
  const consider = (card: Card, nameScore: number) => {
    const existing = byId.get(card.id)
    if (existing && existing.nameScore >= nameScore) return
    const code = codeWeight.get(card.id) ?? 0
    const number = cardNumber(card)
    const numberMatch = numbers.has(number) || numbers.has(number.replace(/[^0-9]+$/, ''))
    const setMatch = sets.has(card.setCode.toLowerCase())
    let score = (nameScore > 0 ? nameScore : 0.2) + 0.6 * code
    if (!code) score += (numberMatch ? 0.25 : 0) + (setMatch ? 0.15 : 0)
    // Pokémon "3/73": the set whose size is closest to the printed total.
    if (index.gameId === 'pokemon') {
      const size = index.setSize.get(card.setCode.toLowerCase()) ?? 0
      for (const t of evidence.totals) {
        if (t.number !== number) continue
        const over = size - t.total // secret rares make a set a bit bigger than its printed total
        score += over >= 0 && over <= Math.max(12, t.total * 0.35) ? 0.2 : over < 0 && over > -3 ? 0.1 : 0
        break
      }
    }
    // A variant word printed on the card ("SP", "3rd Place", "Finalist") that the data also names this printing by.
    for (const label of variantLabels(card)) {
      if ((label.length >= 4 || label === 'sp') && fullText.includes(label.slice(0, 12))) {
        score += 0.05
        break
      }
    }
    // The card type is printed too: "LEADER" vs "CHARACTER" splits a One Piece leader from its characters.
    const category = squash(card.category)
    if (category.length >= 4 && fullText.includes(category)) score += 0.04
    // Magic's rarity letter: "P" marks a promo, C/U/R/M the rarity.
    if (index.gameId === 'mtg' && evidence.rarityLetters.length) {
      // Promo-pack cards print their normal rarity letter; only some promos print "P".
      const promo = card.setCode.length >= 4 && card.setCode.startsWith('P')
      const letter = (card.rarity ?? '').charAt(0).toUpperCase()
      if (evidence.rarityLetters.includes(letter) || (promo && evidence.rarityLetters.includes('P'))) score += 0.04
    }
    byId.set(card.id, { card, score, nameScore, codeWeight: code, numberMatch, setMatch })
  }
  const nameIdOf = new Map<string, number>()
  for (const [id, score] of nameScores) {
    for (const card of index.names[id].printings) {
      nameIdOf.set(card.id, id)
      consider(card, score)
    }
  }
  // Printings named by a code alone (the name was unreadable, or matched another card).
  for (const hit of evidence.codes) for (const t of index.byCode.get(hit.key) ?? []) if (!byId.has(t.card.id)) consider(t.card, 0)

  const candidates = [...byId.values()].sort((a, b) => b.score - a.score || b.nameScore - a.nameScore)
  const best = candidates[0]
  let status: MatchStatus = 'none'
  let name: NameEntry | null = null
  if (best) {
    const bestNameId = nameIdOf.get(best.card.id)
    name = bestNameId != null ? index.names[bestNameId] : null
    const tied = candidates.filter((c) => c.score >= best.score - 0.05)
    if (tied.length === 1 && ((best.codeWeight >= 0.8 && best.nameScore >= 0.6) || best.nameScore >= 0.85)) status = 'exact'
    else if (best.nameScore >= 0.8 || best.codeWeight >= 1) status = 'name'
    else if (best.score >= 0.6) status = 'unsure'
  }
  return { status, candidates: candidates.slice(0, 60), evidence, name }
}

/** Printings the text can't tell apart from the best one - what the picture decides between. */
export function textTies(result: MatchResult, margin = 0.08): Candidate[] {
  const best = result.candidates[0]
  if (!best) return []
  return result.candidates.filter((c) => c.score >= best.score - margin)
}

/**
 * Whether a reading of just the first-pass lines (priority.ts) already identifies the card well enough
 * that reading the rest (mostly rules text) wouldn't change the answer.
 */
/** A name read this clearly settles the card; rules text wouldn't change it (checked on the test photos). */
const NAME_ENOUGH = 0.95

export function firstPassIsEnough(result: MatchResult): boolean {
  const best = result.candidates[0]
  if (!best) return false
  // A full printed code (set + number + total, or One Piece's / Yu-Gi-Oh!'s card code) that agrees with
  // part of the name read so far ("Kennen" of "Kennen, Storm of Shuriken") pins the printing by itself.
  return result.status === 'exact' || best.nameScore >= NAME_ENOUGH || (best.nameScore >= 0.8 && best.codeWeight >= 0.8) || (best.codeWeight >= 0.95 && best.nameScore >= 0.25)
}
