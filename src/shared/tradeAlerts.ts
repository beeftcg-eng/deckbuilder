import type { TradeMatch } from './types'

/**
 * New trade matches since the last check: someone now has a card you want, or wants one you have
 * for trade. What's been seen is remembered as "<user>|<have|want>|<game>|<card>" keys, so a
 * match is announced once. The very first check only records what's there, instead of announcing
 * every existing match at once.
 */

export interface FreshMatch {
  displayName: string
  /** Cards they have that you want. */
  have: string[]
  /** Your for-trade cards they want. */
  want: string[]
}

const MAX_SEEN = 3000

export function freshTradeMatches(matches: readonly TradeMatch[], seen: readonly string[] | undefined): { fresh: FreshMatch[]; seen: string[] } {
  const known = new Set(seen ?? [])
  const all: string[] = []
  const fresh: FreshMatch[] = []
  for (const m of matches) {
    const entry: FreshMatch = { displayName: m.displayName, have: [], want: [] }
    for (const [side, cards, list] of [['have', m.theyHaveWhatIWant, entry.have], ['want', m.iHaveWhatTheyWant, entry.want]] as const) {
      for (const card of cards) {
        const key = `${m.userId}|${side}|${card.gameId}|${card.cardName}`
        all.push(key)
        if (seen && !known.has(key)) list.push(card.cardName)
      }
    }
    if (entry.have.length + entry.want.length > 0) fresh.push(entry)
  }
  // Keys still matching come first, so the list never drops something that's still a match.
  const next = [...new Set([...all, ...(seen ?? [])])].slice(0, MAX_SEEN)
  return { fresh, seen: next }
}
