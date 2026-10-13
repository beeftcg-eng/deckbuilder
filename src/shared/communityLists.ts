import { jsonValueAt, nextFlightData } from './deckUrl'
import { decodeDeckCode } from './riftboundDeckCode'
import { t } from './i18n'

/**
 * Community lists: recent tournament decklists to look through and import. Riftbound's come from
 * RiftAtlas: its Decks page (riftatlas.com/decks) names the recent events and each Legend's latest
 * finishes, and each event's page (riftatlas.com/events/<id>) has every deck from its standings, as
 * Riftbound deck codes (riftboundDeckCode.ts).
 *
 * RiftAtlas doesn't let other web pages read it, so the daily phone-app deploy collects the lists
 * (scripts/build-community-lists.ts) and publishes them as community/riftbound.json next to the app,
 * which every app reads first. The desktop app can also read RiftAtlas itself, in its main process
 * (electron/ipc/communityLists.ts), for when that file is missing or old.
 */

export const COMMUNITY_LISTS_URL = 'https://riftatlas.com/decks'
export const COMMUNITY_LISTS_HOST = 'riftatlas.com'
export const COMMUNITY_FILE_URL = 'https://beeftcg-eng.github.io/deckbuilder/community/riftbound.json'

/** An event's page on RiftAtlas, or null for an id that isn't one. */
export function eventPageUrl(eventId: string): string | null {
  return /^[a-z0-9][a-z0-9-]{0,199}$/.test(eventId) ? `https://riftatlas.com/events/${eventId}` : null
}

export interface CommunityList {
  id: string
  eventId: string
  legendId: string
  /** "Kennen, Heart of the Tempest", or the Legend's code when the page doesn't name it. */
  legendName: string
  eventName: string
  /** ISO date-time the event started, when known. */
  date: string | null
  players: number | null
  rank: number | null
  player: string | null
  deckCode: string
}

/** The published file (and the copy each app keeps for when it's offline). */
export interface CommunityListsFile {
  updatedAt: string
  lists: CommunityList[]
}

export interface RiftAtlasEvent {
  id: string
  name: string
  date: string | null
  players: number | null
}

interface RiftAtlasFinish {
  eventId?: string
  eventName?: string
  startDate?: string
  players?: number
  rank?: number
  player?: string
  legendId?: string
  hasDeck?: boolean
  deckCode?: string
}

/** The object right after `"key":` in the page's data. */
function objectAfter(data: string, key: string): Record<string, unknown> {
  const at = data.indexOf(`"${key}":{`)
  const value = at >= 0 ? jsonValueAt(data, at + key.length + 3) : undefined
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

const listId = (eventId: string, rank: number | null, deckCode: string) => `${eventId}|${rank ?? ''}|${deckCode}`

export interface DecksPage {
  lists: CommunityList[]
  /** Legend names by code ("VEN-155" -> "Kennen, Heart of the Tempest"). */
  labels: Record<string, string>
  /** The events its finishes come from, newest first. */
  events: RiftAtlasEvent[]
}

/**
 * RiftAtlas's Decks page: the finishes with a deck, the Legends' names and the events. Throws if the
 * page no longer carries them where it did, so a redesign there says so instead of looking like a
 * quiet week.
 */
export function readDecksPage(html: string): DecksPage {
  const data = nextFlightData(html)
  if (!data.includes('"details":{')) throw new Error(t.communityLists.layoutChanged)
  const labels: Record<string, string> = {}
  for (const [code, label] of Object.entries(objectAfter(data, 'labels'))) {
    const name = (label as { name?: unknown } | null)?.name
    if (typeof name === 'string') labels[code] = name
  }
  const details = objectAfter(data, 'details') as Record<string, { finishes?: RiftAtlasFinish[] } | undefined>
  const lists: CommunityList[] = []
  const events = new Map<string, RiftAtlasEvent>()
  let finishes = 0
  let readable = 0
  for (const legend of Object.values(details)) {
    for (const f of legend?.finishes ?? []) {
      finishes++
      if (typeof f.legendId === 'string') readable++
      const eventId = f.eventId ?? ''
      if (eventId && !events.has(eventId))
        events.set(eventId, { id: eventId, name: f.eventName ?? '', date: f.startDate ?? null, players: typeof f.players === 'number' ? f.players : null })
      if (!f.hasDeck || !f.deckCode || !f.legendId) continue
      const rank = typeof f.rank === 'number' ? f.rank : null
      lists.push({
        id: listId(eventId, rank, f.deckCode),
        eventId,
        legendId: f.legendId,
        legendName: labels[f.legendId] ?? f.legendId,
        eventName: f.eventName ?? '',
        date: f.startDate ?? null,
        players: typeof f.players === 'number' ? f.players : null,
        rank,
        player: f.player ?? null,
        deckCode: f.deckCode,
      })
    }
  }
  // Finishes, but none with the fields this reads: they've changed.
  if (finishes > 0 && readable === 0) throw new Error(t.communityLists.layoutChanged)
  return { lists: sortLists(dedupe(lists)), labels, events: [...events.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) }
}

/** The finishes on the Decks page alone (what the window showed before event pages were read). */
export function fromRiftAtlas(html: string): CommunityList[] {
  return readDecksPage(html).lists
}

/** The Legend a deck code plays: the first of its cards that's a Legend RiftAtlas names. */
function legendOf(deckCode: string, labels: Record<string, string>): string | null {
  try {
    const deck = decodeDeckCode(deckCode)
    for (const code of [...deck.main.map((e) => e.code), ...deck.extraLegends]) {
      const base = code.replace(/[a-z]$/, '')
      if (labels[base]) return base
    }
  } catch {
    // not a code this can read
  }
  return null
}

/**
 * An event's page: every deck in its standings. The top of the standings links each deck
 * ("/decks/view?code=...&name=<player> · <event>&event=<id>&rank=<n>"); the rest of it is data rows
 * ({rank, player, legendId, deckCode}).
 */
export function readEventPage(html: string, event: RiftAtlasEvent, labels: Record<string, string>): CommunityList[] {
  const data = nextFlightData(html) || html
  const lists: CommunityList[] = []
  const add = (deckCode: string, rank: number | null, player: string | null, legendId?: string | null) => {
    const legend = legendId ?? legendOf(deckCode, labels)
    if (!legend) return
    lists.push({
      id: listId(event.id, rank, deckCode),
      eventId: event.id,
      legendId: legend,
      legendName: labels[legend] ?? legend,
      eventName: event.name,
      date: event.date,
      players: event.players,
      rank,
      player,
      deckCode,
    })
  }
  const link = /\/decks\/view\?code=([A-Z2-7]+)&(?:amp;)?name=([^&"\\]*)&(?:amp;)?event=([a-z0-9-]+)&(?:amp;)?rank=(\d+)/g
  for (let m = link.exec(data); m; m = link.exec(data)) {
    if (m[3] !== event.id) continue
    let name = ''
    try {
      name = decodeURIComponent(m[2].replace(/\+/g, ' '))
    } catch {
      // a name that isn't valid URL encoding: no player
    }
    add(m[1], Number(m[4]), name.split(' · ')[0].trim() || null)
  }
  const rowsAt = data.indexOf('"rows":[{"rank"')
  const rows = rowsAt >= 0 ? jsonValueAt(data, rowsAt + '"rows":'.length) : undefined
  for (const row of Array.isArray(rows) ? (rows as { rank?: unknown; player?: unknown; legendId?: unknown; deckCode?: unknown }[]) : []) {
    if (typeof row.deckCode !== 'string' || !row.deckCode) continue
    add(row.deckCode, typeof row.rank === 'number' ? row.rank : null, typeof row.player === 'string' ? row.player : null, typeof row.legendId === 'string' ? row.legendId : null)
  }
  return dedupe(lists)
}

function dedupe(lists: CommunityList[]): CommunityList[] {
  const seen = new Map<string, CommunityList>()
  for (const l of lists) if (!seen.has(l.id)) seen.set(l.id, l)
  return [...seen.values()]
}

/** Newest event first, best placing first within one. */
export function sortLists(lists: CommunityList[]): CommunityList[] {
  return lists.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.eventName.localeCompare(b.eventName) || (a.rank ?? 999) - (b.rank ?? 999))
}

/**
 * Every list RiftAtlas has right now: the Decks page, then each of its events' pages (`maxEvents`
 * newest, a few at a time). An event page that fails is skipped (its Decks-page finishes stay); the
 * Decks page failing, or no deck at all, throws.
 */
export async function collectCommunityLists(fetchPage: (url: string) => Promise<string>, maxEvents = 16): Promise<CommunityListsFile> {
  const page = readDecksPage(await fetchPage(COMMUNITY_LISTS_URL))
  const all = [...page.lists]
  const queue = page.events.slice(0, maxEvents)
  const worker = async () => {
    for (let event = queue.shift(); event; event = queue.shift()) {
      const url = eventPageUrl(event.id)
      if (!url) continue
      try {
        all.push(...readEventPage(await fetchPage(url), event, page.labels))
      } catch (err) {
        console.warn(`Community lists: skipped ${event.id}:`, err instanceof Error ? err.message : err)
      }
    }
  }
  await Promise.all([worker(), worker(), worker()])
  const lists = sortLists(dedupe(all))
  if (!lists.length) throw new Error(t.communityLists.layoutChanged)
  return { updatedAt: new Date().toISOString(), lists }
}

/** A published or saved file, if it's one: lists with the fields the app needs. */
export function readCommunityListsFile(raw: unknown): CommunityListsFile | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { updatedAt?: unknown; lists?: unknown }
  if (typeof r.updatedAt !== 'string' || !Array.isArray(r.lists)) return null
  const lists = r.lists.filter(
    (l): l is CommunityList =>
      !!l && typeof l === 'object' && typeof l.id === 'string' && typeof l.legendId === 'string' && typeof l.deckCode === 'string' && typeof l.legendName === 'string',
  )
  return lists.length ? { updatedAt: r.updatedAt, lists: lists.map((l) => ({ ...l, eventId: l.eventId ?? '', eventName: l.eventName ?? '' })) } : null
}
