import type { CommunityList, CommunityListsFile, ListCard } from './communityLists'
import { sortLists } from './communityLists'

/**
 * One Piece and Pokémon tournament lists from Limitless (play.limitlesstcg.com), for the Community
 * lists window. Its API is open (no key) but allows 50 requests in 5 minutes, so the apps don't read
 * it themselves: the daily deploy collects the lists (scripts/build-community-lists.ts) and publishes
 * them as community/<game>.json, the same way as Riftbound's from RiftAtlas.
 *
 * The API: GET /tournaments?game=…&limit=… lists the newest events, GET /tournaments/<id>/standings
 * each player's placing, archetype (`deck`) and `decklist`, by section (One Piece: leader, character,
 * event, stage; Pokémon: pokemon, trainer, energy), each card with name, set, number and count.
 */
export const LIMITLESS_API = 'https://play.limitlesstcg.com/api'
export const LIMITLESS_SITE = 'https://play.limitlesstcg.com'

export type LimitlessGame = 'onepiece' | 'pokemon'

const SETTINGS: Record<LimitlessGame, { code: string; formats: (string | null)[]; minPlayers: number; site: string }> = {
  // Limitless leaves an event's format empty when it's plain Standard; "EXTRA" is a different card pool.
  onepiece: { code: 'OP', formats: ['STANDARD', null], minPlayers: 16, site: `${LIMITLESS_SITE}/tournaments?game=OP` },
  pokemon: { code: 'PTCG', formats: ['STANDARD'], minPlayers: 32, site: `${LIMITLESS_SITE}/tournaments?game=PTCG&format=STANDARD` },
}

/** The page "Open Limitless" goes to for a game. */
export const limitlessSite = (game: LimitlessGame) => SETTINGS[game].site

/** Lists kept from each event: its top finishes, where the meta is. */
const TOP_PER_EVENT = 16

interface Tournament {
  id: string
  name: string
  date: string
  format: string | null
  players: number
}

interface RawCard {
  count?: number
  name?: string
  set?: string
  number?: string
}

interface Standing {
  name?: string
  player?: string
  placing?: number | null
  deck?: { id?: string; name?: string; icons?: string[] } | null
  decklist?: Record<string, RawCard[] | RawCard> | null
}

const isCard = (c: RawCard): c is Required<RawCard> => typeof c?.name === 'string' && typeof c.set === 'string' && typeof c.number === 'string' && typeof c.count === 'number' && c.count > 0

/** A decklist's cards, each in the zone this app puts it in. */
export function listCards(game: LimitlessGame, decklist: Standing['decklist']): ListCard[] {
  const out: ListCard[] = []
  for (const [section, raw] of Object.entries(decklist ?? {})) {
    const zone = game === 'onepiece' && section === 'leader' ? 'leader' : 'main'
    const cards = Array.isArray(raw) ? raw : [{ count: 1, ...raw }]
    for (const c of cards) if (isCard(c)) out.push({ zone, count: c.count, set: c.set, number: c.number, name: c.name })
  }
  return out
}

/** What a list is: its Leader (One Piece), or Limitless's archetype (Pokémon), and the card to picture it by. */
function archetype(game: LimitlessGame, s: Standing, cards: ListCard[]): Pick<CommunityList, 'legendId' | 'legendName' | 'art'> | null {
  if (game === 'onepiece') {
    const leader = cards.find((c) => c.zone === 'leader')
    if (!leader) return null
    // Several Leaders share a name ("Nico Robin"): the card number tells them apart.
    return { legendId: `${leader.set}-${leader.number}`, legendName: `${leader.name} · ${leader.set}-${leader.number}`, art: { set: leader.set, number: leader.number } }
  }
  const id = s.deck?.id
  if (!id) return { legendId: 'other', legendName: 'Other' }
  // The archetype's first icon is its main Pokémon ("dragapult", "rayquaza-mega"): picture it by the
  // card in the list whose name has all of the icon's words ("Mega Rayquaza ex").
  const iconWords = s.deck?.icons?.[0]?.toLowerCase().split('-').filter(Boolean) ?? []
  const words = (name: string) => new Set(name.toLowerCase().split(/[^a-z0-9]+/))
  const art = iconWords.length ? cards.find((c) => iconWords.every((w) => words(c.name).has(w))) : undefined
  return { legendId: id, legendName: s.deck?.name ?? id, ...(art ? { art: { set: art.set, number: art.number } } : {}) }
}

/** One event's top lists. */
export function eventLists(game: LimitlessGame, event: Tournament, standings: Standing[]): CommunityList[] {
  const out: CommunityList[] = []
  for (const s of standings) {
    if (s.placing == null || s.placing > TOP_PER_EVENT) continue
    const cards = listCards(game, s.decklist)
    if (!cards.length) continue
    const kind = archetype(game, s, cards)
    if (!kind) continue
    out.push({
      id: `${event.id}|${s.placing}|${s.player ?? s.name ?? ''}`,
      gameId: game,
      eventId: event.id,
      eventName: event.name,
      date: event.date ?? null,
      players: event.players ?? null,
      rank: s.placing,
      player: s.name ?? s.player ?? null,
      deckCode: '',
      cards,
      ...kind,
    })
  }
  return out
}

/**
 * The newest events' top lists. `getJson` reads an API path (the caller handles retries and the rate
 * limit). An event that fails is skipped; no lists at all throws.
 */
export async function collectLimitlessLists(game: LimitlessGame, getJson: (path: string) => Promise<unknown>, maxEvents = 15, maxAgeDays = 45): Promise<CommunityListsFile> {
  const { code, formats, minPlayers } = SETTINGS[game]
  const tournaments = (await getJson(`/tournaments?game=${code}&limit=100`)) as Tournament[]
  if (!Array.isArray(tournaments)) throw new Error('Limitless: the tournament list is not a list')
  const since = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const events = tournaments
    .filter((e) => formats.includes(e.format ?? null) && (e.players ?? 0) >= minPlayers && new Date(e.date).getTime() >= since)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxEvents)
  const lists: CommunityList[] = []
  for (const event of events) {
    try {
      const standings = (await getJson(`/tournaments/${encodeURIComponent(event.id)}/standings`)) as Standing[]
      if (Array.isArray(standings)) lists.push(...eventLists(game, event, standings))
    } catch (err) {
      console.warn(`Limitless ${code}: skipped ${event.id}:`, err instanceof Error ? err.message : err)
    }
  }
  if (!lists.length) throw new Error(`Limitless ${code}: no lists`)
  return { updatedAt: new Date().toISOString(), lists: sortLists(lists) }
}
