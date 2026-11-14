import type { Deck, DeckCardEntry } from '../types'
import type { GameState } from './riftbound'

/**
 * A best-of-3 match against the bot: the score, the battlefields each side has played (in a match a
 * battlefield can't be picked again for a later game), and your sideboarding between games (cards
 * swapped one for one between the main deck and the sideboard).
 */
export interface Match {
  /** Ties the match's games together in your practice record. */
  id?: string
  bestOf: 3
  /** Games won: yours, the bot's. */
  wins: [number, number]
  /** Battlefield card ids each side has played on, game by game. */
  used: [string[], string[]]
  /** Your swaps from the deck as saved: card id -> copies taken out of the main deck / brought in from the sideboard. */
  out: Record<string, number>
  in: Record<string, number>
  /** The bot's deck, the same for every game of the match. */
  bot: Pick<Deck, 'zones' | 'freeTextZones'> | null
}

export type DeckLists = Pick<Deck, 'zones' | 'freeTextZones'>

export const newMatch = (bot: DeckLists | null, id = `m${Date.now().toString(36)}`): Match => ({ id, bestOf: 3, wins: [0, 0], used: [[], []], out: {}, in: {}, bot })

/** Games needed to win the match. */
const needed = (m: Match) => Math.ceil(m.bestOf / 2)

/** Who won the match (0 you, 1 the bot), or null while it goes on. */
export function matchWinner(m: Match): 0 | 1 | null {
  if (m.wins[0] >= needed(m)) return 0
  if (m.wins[1] >= needed(m)) return 1
  return null
}

/** The match with a game's result added. */
export const withResult = (m: Match, winner: 0 | 1): Match => ({ ...m, wins: winner === 0 ? [m.wins[0] + 1, m.wins[1]] : [m.wins[0], m.wins[1] + 1] })

/** The match with the battlefields of a game that just started (yours, the bot's). */
export const withBattlefields = (m: Match, mine: string | null, theirs: string | null): Match => ({
  ...m,
  used: [mine ? [...m.used[0], mine] : m.used[0], theirs ? [...m.used[1], theirs] : m.used[1]],
})

function adjust(entries: DeckCardEntry[], cardId: string, by: number): DeckCardEntry[] {
  const out = entries.map((e) => ({ ...e }))
  const e = out.find((x) => x.cardId === cardId)
  if (e) e.quantity += by
  else if (by > 0) out.push({ cardId, quantity: by })
  return out.filter((x) => x.quantity > 0)
}

/** The deck with the match's swaps made: main deck and sideboard. */
export function swapped(deck: DeckLists, m: Pick<Match, 'out' | 'in'>): DeckLists {
  let main = deck.zones.main ?? []
  let side = deck.zones.sideboard ?? []
  for (const [id, n] of Object.entries(m.out)) {
    main = adjust(main, id, -n)
    side = adjust(side, id, n)
  }
  for (const [id, n] of Object.entries(m.in)) {
    side = adjust(side, id, -n)
    main = adjust(main, id, n)
  }
  return { ...deck, zones: { ...deck.zones, main, sideboard: side } }
}

/**
 * One copy of `cardId` moved: 'out' of the main deck to the sideboard, or 'in' from the sideboard.
 * Moving back what was swapped the other way undoes that swap. Null when there's no copy to move.
 */
export function swap(deck: DeckLists, m: Pick<Match, 'out' | 'in'>, cardId: string, dir: 'out' | 'in'): Pick<Match, 'out' | 'in'> | null {
  const now = swapped(deck, m)
  const from = dir === 'out' ? now.zones.main : now.zones.sideboard
  if (!(from ?? []).some((e) => e.cardId === cardId && e.quantity > 0)) return null
  const back = dir === 'out' ? 'in' : 'out'
  const next = { out: { ...m.out }, in: { ...m.in } }
  if ((next[back][cardId] ?? 0) > 0) {
    next[back][cardId] -= 1
    if (!next[back][cardId]) delete next[back][cardId]
  } else next[dir][cardId] = (next[dir][cardId] ?? 0) + 1
  return next
}

/** Copies out and in: the main deck keeps its size when they're equal. */
export const swapCounts = (m: Pick<Match, 'out' | 'in'>) => ({
  out: Object.values(m.out).reduce((a, b) => a + b, 0),
  in: Object.values(m.in).reduce((a, b) => a + b, 0),
})

/** The battlefields `side` may still pick (all of them, if every one has been played). */
export function openBattlefields<T extends { id: string }>(battlefields: T[], m: Match | null | undefined, side: 0 | 1): T[] {
  if (!m) return battlefields
  const left = battlefields.filter((b) => !m.used[side].includes(b.id))
  return left.length ? left : battlefields
}

// ---------- online, against a friend: the match lives in the game state ----------

type Series = NonNullable<GameState['series']>

/** The score with a finished game counted: yours (side 0 from where you sit), theirs. */
export function seriesScore(s: GameState): [number, number] {
  const w = s.series?.wins ?? [0, 0]
  if (s.phase !== 'over' || s.winner == null) return w
  return s.winner === 0 ? [w[0] + 1, w[1]] : [w[0], w[1] + 1]
}

/** Who won the match (0 or 1), or null while it goes on (or there's none). */
export function seriesWinner(s: GameState): 0 | 1 | null {
  if (!s.series) return null
  const [a, b] = seriesScore(s)
  const need = Math.ceil(s.series.bestOf / 2)
  return a >= need ? 0 : b >= need ? 1 : null
}

/** The next game's series: this game's result counted, and the battlefields it will be played on. */
export function nextSeries(prev: GameState, mine: string | null, theirs: string | null): Series {
  const series = prev.series ?? { bestOf: 3 as const, wins: [0, 0] as [number, number], used: [[], []] as [string[], string[]] }
  return { ...series, wins: seriesScore(prev), used: [mine ? [...series.used[0], mine] : series.used[0], theirs ? [...series.used[1], theirs] : series.used[1]] }
}

/** The battlefields side 0 may pick for the next game of an online match. */
export function seriesOpen<T extends { id: string }>(battlefields: T[], s: GameState): T[] {
  const left = battlefields.filter((b) => !(s.series?.used[0] ?? []).includes(b.id))
  return left.length ? left : battlefields
}
