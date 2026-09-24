import type { Card } from './types'

/**
 * Ranks a search match so an exact/prefix name hit (e.g. plain "Blue-Eyes White Dragon" when
 * searching "Blue-Eyes") outranks every printing/reprint that only matches elsewhere (text,
 * subtypes, set code...) or partway through the name. Within a tie on the name itself (every
 * "Blue-Eyes ___ Dragon" variant starts with "Blue-Eyes"), a vanilla Normal Monster - what "the
 * original" usually means for an archetype's founding card - outranks Effect/Fusion/Synchro/XYZ/
 * Link spinoffs of it; Yu-Gi-Oh-only signal (card.subtypes carries "Normal" there), a no-op for
 * every other game since none of their subtypes use that word this way. Lower ranks first.
 */
export function matchRank(c: Card, query: string): number {
  const name = c.name.toLowerCase()
  const q = query.toLowerCase()
  const vanilla = c.subtypes.includes('Normal') ? 0 : 1
  if (name === q) return 0
  if (name.startsWith(q)) return 2 + vanilla
  if (name.includes(q)) return 4
  return 5
}

const compact = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, '')

/**
 * Whether a search is the card's full printed code, like "LEDE-EN067" (Yu-Gi-Oh), "OP01-006" or
 * "SVI 189". The set code and the number are stored apart ("LEDE" and "EN067"), so neither one
 * alone contains the whole query. Separators and case don't matter ("lede en067", "LEDEEN067"),
 * and a partial code matches too ("LEDE-EN0"). Needs at least 3 characters so a short name search
 * doesn't match codes by accident.
 */
export function matchesPrintedCode(c: Card, query: string): boolean {
  const q = compact(query)
  if (q.length < 3 || !c.number) return false
  return compact(`${c.setCode}${c.number}`).includes(q)
}

/**
 * The card browser's search: card name, rules text, subtypes, flavor names, the card's own id, the
 * expansion's name ("Legacy of Destruction", "Scarlet & Violet"...) or code ("LEDE", "OP01"), the
 * collector number, or the full printed code ("LEDE-EN067"). Same for every game. `query` must
 * already be lower-cased. Name matches still rank first (matchRank), so searching an expansion's
 * name doesn't bury a card that's called the same thing.
 */
export function matchesSearch(c: Card, query: string): boolean {
  const q = query.toLowerCase()
  return (
    c.name.toLowerCase().includes(q) ||
    !!c.text?.toLowerCase().includes(q) ||
    c.subtypes.some((s) => s.toLowerCase().includes(q)) ||
    !!c.flavorNames?.some((n) => n.toLowerCase().includes(q)) ||
    c.sourceId.toLowerCase().includes(q) ||
    c.setName.toLowerCase().includes(q) ||
    c.setCode.toLowerCase().includes(q) ||
    c.number.toLowerCase().includes(q) ||
    matchesPrintedCode(c, q)
  )
}
