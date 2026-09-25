import { callRpc, refreshAccessToken, type SyncConfig } from './sync/client'
import type { PairingsDeckRecord, PairingsResult, PairingsVersion } from './types'

/**
 * Tournament results for your decks, read from Pairings (the TCG tournament tracker) - a separate
 * app with its own Supabase project and its own account, so its login is kept apart from the
 * Pawmodoro one. Pairings links one of its decks to one of ours when you import it from here
 * (its `brewhouseDeckId`), and its `brewhouse_deck_records` RPC returns every result logged with
 * such a deck. Plain fetch() via sync/client, so it runs in Electron's main process and the PWA alike.
 */

export const PAIRINGS_APP_URL = 'https://pairings-coral.vercel.app'

/** Same regex as Pairings' own parseRecord, so both apps count a record the same way. */
export function parseRecord(record: string): { w: number; l: number; d: number } | null {
  const m = String(record ?? '').match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/)
  if (!m) return null
  return { w: parseInt(m[1], 10), l: parseInt(m[2], 10), d: m[3] ? parseInt(m[3], 10) : 0 }
}

export interface RecordSummary {
  wins: number
  losses: number
  draws: number
  /** Wins out of decided games (draws left out), as Pairings shows it; null before any decided game. */
  winRate: number | null
  events: number
  /** Newest first. */
  results: PairingsResult[]
  /** Every opponent faced in logged matches, most-played first. */
  matchups: Matchup[]
  /** Opponents you beat the most / lose to the most, among those faced at least twice (like Pairings' own stats). */
  bestAgainst: Matchup[]
  toughestAgainst: Matchup[]
}

export interface Matchup {
  opponent: string
  wins: number
  losses: number
  draws: number
  games: number
}

/** How many games against one opponent before it counts as a matchup, so one fluke doesn't top a list. */
const MIN_MATCHUP_GAMES = 2

/** Opponents are typed by hand, so "jinx" and "Jinx " are the same opponent; the first spelling seen is shown. */
export function matchupsOf(results: PairingsResult[]): Matchup[] {
  const byKey = new Map<string, Matchup>()
  for (const r of results) {
    for (const m of r.matches) {
      const name = m.opponent.trim()
      if (!name || !m.outcome) continue
      const key = name.toLowerCase()
      const entry = byKey.get(key) ?? { opponent: name, wins: 0, losses: 0, draws: 0, games: 0 }
      if (m.outcome === 'W') entry.wins++
      else if (m.outcome === 'L') entry.losses++
      else entry.draws++
      entry.games++
      byKey.set(key, entry)
    }
  }
  return [...byKey.values()].sort((a, b) => b.games - a.games || a.opponent.localeCompare(b.opponent))
}

export function summarizeRecord(results: PairingsResult[]): RecordSummary {
  let wins = 0
  let losses = 0
  let draws = 0
  for (const r of results) {
    const rec = parseRecord(r.record)
    if (!rec) continue
    wins += rec.w
    losses += rec.l
    draws += rec.d
  }
  const decided = wins + losses
  const matchups = matchupsOf(results)
  const eligible = matchups.filter((m) => m.games >= MIN_MATCHUP_GAMES)
  const rate = (m: Matchup) => (m.wins + m.losses > 0 ? m.wins / (m.wins + m.losses) : 0)
  return {
    wins,
    losses,
    draws,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : null,
    events: results.length,
    results: [...results].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    matchups,
    bestAgainst: eligible.filter((m) => m.wins > 0).sort((a, b) => b.wins - a.wins || rate(b) - rate(a)).slice(0, 3),
    toughestAgainst: eligible.filter((m) => m.losses > 0).sort((a, b) => b.losses - a.losses || rate(a) - rate(b)).slice(0, 3),
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

/** The RPC's rows come from another app's free-form data, so every field is checked, not trusted. */
export function parseDeckRecords(raw: unknown): PairingsDeckRecord[] {
  const decks = (raw as { decks?: unknown } | null)?.decks
  if (!Array.isArray(decks)) return []
  const out: PairingsDeckRecord[] = []
  for (const d of decks) {
    const id = str((d as { brewhouse_deck_id?: unknown })?.brewhouse_deck_id)
    if (!id) continue
    const results = (d as { results?: unknown }).results
    const hash = (d as { synced_hash?: unknown }).synced_hash
    const version = Number((d as { version?: unknown }).version)
    const versions = (d as { versions?: unknown }).versions
    out.push({
      brewhouseDeckId: id,
      syncedHash: typeof hash === 'string' && hash ? hash : null,
      version: Number.isInteger(version) && version > 0 ? version : null,
      versions: (Array.isArray(versions) ? versions : []).flatMap((v) => {
        const n = Number(v?.n)
        if (!Number.isInteger(n) || n < 1) return []
        const cardCount = Number(v?.card_count)
        return [{ n, from: str(v?.from), cardCount: v?.card_count != null && Number.isInteger(cardCount) && cardCount > 0 ? cardCount : null, note: str(v?.note) }]
      }),
      results: (Array.isArray(results) ? results : []).map((r) => ({
        event: str(r?.event),
        date: str(r?.date),
        game: str(r?.game),
        format: str(r?.format),
        store: str(r?.store),
        placement: str(r?.placement),
        record: str(r?.record),
        inProgress: r?.in_progress === true,
        deckVersion: Number.isInteger(r?.deck_version) && r.deck_version > 0 ? r.deck_version : null,
        matches: (Array.isArray(r?.matches) ? r.matches : []).map((m: { opponent?: unknown; outcome?: unknown; went_first?: unknown }) => {
          const outcome = str(m?.outcome)
          const wentFirst = str(m?.went_first)
          return {
            opponent: str(m?.opponent),
            outcome: outcome === 'W' || outcome === 'L' || outcome === 'D' ? outcome : '',
            wentFirst: wentFirst === 'yes' || wentFirst === 'no' ? wentFirst : '',
          }
        }),
      })),
    })
  }
  return out
}

/** Supabase rotates the refresh token on every use - the caller must persist the returned one. */
export async function fetchDeckRecords(config: SyncConfig): Promise<{ records: PairingsDeckRecord[]; refreshToken: string }> {
  const { accessToken, refreshToken } = await refreshAccessToken(config)
  const raw = await callRpc({ ...config, refreshToken }, accessToken, 'brewhouse_deck_records', {})
  return { records: parseDeckRecords(raw), refreshToken }
}

// ---------- Deck stats: what Pairings' own "Stats & versions" screen shows for one deck ----------

export interface StatLine {
  wins: number
  losses: number
  draws: number
  games: number
  /** Wins out of decided games, rounded; null before any decided game. */
  winRate: number | null
}

export interface OpponentLine extends StatLine {
  opponent: string
}

export interface DeckStatsView {
  /** Results (events) counted, newest first. */
  results: PairingsResult[]
  record: StatLine
  /** Rounds where "went first" was noted in Pairings; games is 0 for both when it never was. */
  goingFirst: StatLine
  goingSecond: StatLine
  /** Top five by wins / by losses, like Pairings' deck stats (one game is enough there). */
  best: OpponentLine[]
  toughest: OpponentLine[]
  /** Every opponent faced, most-played first. */
  opponents: OpponentLine[]
}

function line(wins: number, losses: number, draws: number): StatLine {
  const decided = wins + losses
  return { wins, losses, draws, games: decided + draws, winRate: decided > 0 ? Math.round((wins / decided) * 100) : null }
}

/** The deck's versions, oldest first; a deck without a list is one version (Pairings' deckVersions). */
export function deckVersionsOf(versions: PairingsVersion[] | undefined): PairingsVersion[] {
  const list = [...(versions ?? [])].sort((a, b) => a.n - b.n)
  return list.length ? list : [{ n: 1, from: '', cardCount: null, note: '' }]
}

/**
 * The version a result counts toward, as Pairings' resultDeckVersion files it: its stamped version
 * if the deck has it, else the version its date falls in (a version's `from` is the day it started).
 */
export function resultVersion(result: PairingsResult, versions: PairingsVersion[]): number {
  const list = deckVersionsOf(versions)
  if (result.deckVersion != null && list.some((v) => v.n === result.deckVersion)) return result.deckVersion
  let pick = list[0].n
  for (const v of list) if (!v.from || (result.date && v.from <= result.date)) pick = v.n
  return pick
}

/** One deck's tournament stats from its Pairings results, for every version or just `version`. */
export function deckStatsFor(results: PairingsResult[], versions: PairingsVersion[], version?: number): DeckStatsView {
  const shown = version == null ? results : results.filter((r) => resultVersion(r, versions) === version)
  let wins = 0
  let losses = 0
  let draws = 0
  const first = { w: 0, l: 0, d: 0 }
  const second = { w: 0, l: 0, d: 0 }
  for (const r of shown) {
    const rec = parseRecord(r.record)
    if (rec) {
      wins += rec.w
      losses += rec.l
      draws += rec.d
    }
    for (const m of r.matches) {
      const side = m.wentFirst === 'yes' ? first : m.wentFirst === 'no' ? second : null
      if (!side || !m.outcome) continue
      if (m.outcome === 'W') side.w++
      else if (m.outcome === 'L') side.l++
      else side.d++
    }
  }
  const opponents: OpponentLine[] = matchupsOf(shown).map((m) => ({ opponent: m.opponent, ...line(m.wins, m.losses, m.draws) }))
  return {
    results: [...shown].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    record: line(wins, losses, draws),
    goingFirst: line(first.w, first.l, first.d),
    goingSecond: line(second.w, second.l, second.d),
    best: opponents.filter((m) => m.wins > 0).sort((a, b) => b.wins - a.wins || (b.winRate ?? 0) - (a.winRate ?? 0)).slice(0, 5),
    toughest: opponents.filter((m) => m.losses > 0).sort((a, b) => b.losses - a.losses || (a.winRate ?? 0) - (b.winRate ?? 0)).slice(0, 5),
    opponents,
  }
}
