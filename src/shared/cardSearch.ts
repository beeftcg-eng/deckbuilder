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
