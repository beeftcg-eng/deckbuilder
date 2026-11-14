/**
 * Practice games' results (RiftboundGame.tsx records one when a game against the bot ends), kept on
 * the device in settings, newest first, so the setup screen and Against the meta can show your record
 * with a deck against each opponent.
 */
export interface PracticeResult {
  /** When it ended (ISO). */
  at: string
  deckId: string
  /** What you played against: a Legend's code from the Community lists, "deck:<id>" for one of your decks. */
  opponentId: string
  opponentName: string
  won: boolean
  /** Your points and theirs. */
  points: [number, number]
  level: string
  byHand: boolean
}

export const MAX_RESULTS = 300

export interface Record {
  opponentId: string
  opponentName: string
  wins: number
  losses: number
}

/** A deck's record against each opponent, most played first. */
export function recordsFor(results: readonly PracticeResult[] | undefined, deckId: string): Record[] {
  const out = new Map<string, Record>()
  for (const r of results ?? []) {
    if (r.deckId !== deckId) continue
    const rec = out.get(r.opponentId) ?? out.set(r.opponentId, { opponentId: r.opponentId, opponentName: r.opponentName, wins: 0, losses: 0 }).get(r.opponentId)!
    if (r.won) rec.wins++
    else rec.losses++
  }
  return [...out.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || a.opponentName.localeCompare(b.opponentName))
}

export function sanitizePracticeResults(raw: unknown): PracticeResult[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (r): r is PracticeResult =>
        !!r &&
        typeof r === 'object' &&
        typeof r.at === 'string' &&
        typeof r.deckId === 'string' &&
        typeof r.opponentId === 'string' &&
        typeof r.opponentName === 'string' &&
        typeof r.won === 'boolean' &&
        Array.isArray(r.points),
    )
    .slice(0, MAX_RESULTS)
}
