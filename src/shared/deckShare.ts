/**
 * Deck share links: a deck's owner asks the server for a token (deckbuilder_share_deck in Pawmodoro's
 * supabase/schema.sql) and anyone with the link can read that one deck, signed in or not
 * (deckbuilder_shared_deck, callable with just the anon key). The link always opens the phone app,
 * since that's the version that works on any device without installing anything.
 */
import type { Deck, DeckCardEntry, DeckFreeTextEntry, GameId, SharedDeck } from './types'
import { GAME_LIST } from './games/registry'

export const SHARE_BASE_URL = 'https://beeftcg-eng.github.io/deckbuilder/'

const TOKEN_RE = /^[a-f0-9]{16}$/

export function shareUrl(token: string): string {
  return `${SHARE_BASE_URL}?share=${token}`
}

/** The token in a pasted share link (or a bare token), else null. */
export function parseShareToken(text: string): string | null {
  const trimmed = text.trim()
  if (TOKEN_RE.test(trimmed)) return trimmed
  const match = /[?&]share=([a-f0-9]{16})\b/.exec(trimmed)
  return match ? match[1] : null
}

function isGameId(value: unknown): value is GameId {
  return typeof value === 'string' && GAME_LIST.some((g) => g.id === value)
}

function cardEntries(value: unknown): DeckCardEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (e): e is DeckCardEntry => e != null && typeof e.cardId === 'string' && typeof e.quantity === 'number' && e.quantity > 0,
  )
}

function freeTextEntries(value: unknown): DeckFreeTextEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (e): e is DeckFreeTextEntry => e != null && typeof e.label === 'string' && typeof e.quantity === 'number' && e.quantity > 0,
  )
}

function recordOf<T>(value: unknown, entries: (v: unknown) => T[]): Record<string, T[]> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, T[]> = {}
  for (const [zoneId, list] of Object.entries(value)) out[zoneId] = entries(list)
  return out
}

/**
 * The server's deckbuilder_shared_deck row as a SharedDeck, or null when the link is dead (unknown
 * token, sharing stopped, deck deleted) or the row isn't something this app can show. Someone else's
 * deck data is only trusted as far as the shape checks here go.
 */
export function normalizeSharedDeck(row: unknown): SharedDeck | null {
  if (row == null || typeof row !== 'object') return null
  const r = row as { game_id?: unknown; data?: unknown; updated_at?: unknown; owner_name?: unknown }
  if (!isGameId(r.game_id) || r.data == null || typeof r.data !== 'object') return null
  const data = r.data as Record<string, unknown>
  const updatedAt = typeof r.updated_at === 'string' ? r.updated_at : new Date().toISOString()
  const deck: Deck = {
    id: typeof data.id === 'string' ? data.id : 'shared',
    gameId: r.game_id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.slice(0, 200) : 'Shared deck',
    formatId: typeof data.formatId === 'string' ? data.formatId : '',
    ...(typeof data.iconCardId === 'string' ? { iconCardId: data.iconCardId } : {}),
    zones: recordOf(data.zones, cardEntries),
    freeTextZones: recordOf(data.freeTextZones, freeTextEntries),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : updatedAt,
    updatedAt,
  }
  return {
    token: '',
    deck,
    ownerName: typeof r.owner_name === 'string' && r.owner_name.trim() ? r.owner_name.slice(0, 80) : null,
    updatedAt,
  }
}

/** Reads a shared deck with only the project's anon key (no account needed). Plain fetch: works in Node and the browser. */
export async function fetchSharedDeck(url: string, anonKey: string, token: string): Promise<SharedDeck | null> {
  const res = await fetch(`${url}/rest/v1/rpc/deckbuilder_shared_deck`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ p_token: token }),
  })
  const raw = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${raw}`)
  const shared = normalizeSharedDeck(raw ? JSON.parse(raw) : null)
  return shared ? { ...shared, token } : null
}

/** True when a share call failed only because the deck hasn't been uploaded yet (see deckbuilder_share_deck). */
export function isNotSyncedError(err: unknown): boolean {
  return (err instanceof Error ? err.message : String(err)).includes('deck not synced')
}
