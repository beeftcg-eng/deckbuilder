import { jsonValueAt, nextFlightData } from './deckUrl'

/**
 * Community lists: recent tournament decklists to look through and import. Riftbound's come from
 * RiftAtlas's Decks page (riftatlas.com/decks), which carries each Legend's latest finishes - event,
 * player, placing - with the deck as a Riftbound deck code (riftboundDeckCode.ts).
 *
 * RiftAtlas lets other pages read it (CORS), so the phone app fetches it directly; the desktop app
 * reads it in its main process like the deck links (electron/ipc/communityLists.ts).
 */

export const COMMUNITY_LISTS_URL = 'https://riftatlas.com/decks'
export const COMMUNITY_LISTS_HOST = 'riftatlas.com'

export interface CommunityList {
  id: string
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

/** The finishes with a deck on RiftAtlas's Decks page, newest event first and best placing first within one. */
export function fromRiftAtlas(html: string): CommunityList[] {
  const data = nextFlightData(html)
  const labels = objectAfter(data, 'labels') as Record<string, { name?: string } | undefined>
  const details = objectAfter(data, 'details') as Record<string, { finishes?: RiftAtlasFinish[] } | undefined>
  const seen = new Set<string>()
  const lists: CommunityList[] = []
  for (const legend of Object.values(details)) {
    for (const f of legend?.finishes ?? []) {
      if (!f.hasDeck || !f.deckCode || !f.legendId) continue
      const id = `${f.eventId ?? ''}|${f.rank ?? ''}|${f.player ?? ''}|${f.deckCode}`
      if (seen.has(id)) continue
      seen.add(id)
      lists.push({
        id,
        legendId: f.legendId,
        legendName: labels[f.legendId]?.name ?? f.legendId,
        eventName: f.eventName ?? '',
        date: f.startDate ?? null,
        players: typeof f.players === 'number' ? f.players : null,
        rank: typeof f.rank === 'number' ? f.rank : null,
        player: f.player ?? null,
        deckCode: f.deckCode,
      })
    }
  }
  return lists.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.eventName.localeCompare(b.eventName) || (a.rank ?? 999) - (b.rank ?? 999))
}
