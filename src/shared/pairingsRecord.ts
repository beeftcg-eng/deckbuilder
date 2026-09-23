import { callRpc, refreshAccessToken, type SyncConfig } from './sync/client'
import type { PairingsDeckRecord, PairingsResult } from './types'

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
  return {
    wins,
    losses,
    draws,
    winRate: decided > 0 ? Math.round((wins / decided) * 100) : null,
    events: results.length,
    results: [...results].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
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
    out.push({
      brewhouseDeckId: id,
      results: (Array.isArray(results) ? results : []).map((r) => ({
        event: str(r?.event),
        date: str(r?.date),
        game: str(r?.game),
        format: str(r?.format),
        store: str(r?.store),
        placement: str(r?.placement),
        record: str(r?.record),
        inProgress: r?.in_progress === true,
        matches: (Array.isArray(r?.matches) ? r.matches : []).map((m: { opponent?: unknown; outcome?: unknown }) => {
          const outcome = str(m?.outcome)
          return { opponent: str(m?.opponent), outcome: outcome === 'W' || outcome === 'L' || outcome === 'D' ? outcome : '' }
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
