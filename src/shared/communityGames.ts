import type { Card, Deck, DeckCardEntry, GameId } from './types'
import { COMMUNITY_FILE_URL, COMMUNITY_LISTS_URL, type CommunityList } from './communityLists'
import { cardForCode, codeIndex, deckCodeToCards, deckCodeToText } from './riftboundDeckCode'
import { limitlessSite } from './limitless'
import { getAdapter } from './games/registry'
import { normalizeName, poolKey } from './collection'

/**
 * The games with Community lists, and what differs between them: where the lists come from, how a
 * list becomes cards (Riftbound's deck codes; Limitless's set + number for One Piece and Pokémon),
 * and what a list "is" (a Legend, a Leader, or for Pokémon an archetype found by the cards it plays).
 */
export const COMMUNITY_GAME_IDS = ['riftbound', 'onepiece', 'pokemon'] as const satisfies readonly GameId[]
export type CommunityGameId = (typeof COMMUNITY_GAME_IDS)[number]
export const isCommunityGame = (gameId: GameId): gameId is CommunityGameId => (COMMUNITY_GAME_IDS as readonly GameId[]).includes(gameId)

export type ListCards = Pick<Deck, 'zones' | 'freeTextZones'>

export interface CommunityGame {
  gameId: CommunityGameId
  /** The file the daily deploy publishes. */
  fileUrl: string
  /** Where "Open the source" goes. */
  sourceUrl: string
  /** The format a list is imported into. */
  formatId: string
  /** The zone holding the card a list is grouped by (Legend, Leader); null when it's found from the cards (Pokémon). */
  identityZone: string | null
  /** Looks cards up for this game's lists. */
  index: (cards: Iterable<Card>) => Map<string, Card>
  /** The card that pictures a list (or an archetype, from any of its lists). */
  artCard: (index: Map<string, Card>, list: CommunityList) => Card | undefined
  /** A list as deck zones; throws when it can't be read. */
  toDeck: (list: CommunityList, index: Map<string, Card>) => ListCards
  /** A list as decklist text the importer reads. Throws when it can't be read. */
  toText: (list: CommunityList, cardsById: Map<string, Card>, index: Map<string, Card>) => string
}

// ---------- Limitless lists (One Piece, Pokémon) ----------

const limitlessKey = (set: string, number: string) => `${set.toUpperCase()}|${number.replace(/^0+(?=\d)/, '')}`
const nameKey = (name: string) => `name|${normalizeName(name)}`

/**
 * One Piece: the card number ("OP09-102") is the card; of its printings the plainest one (the
 * shortest id, not an alternate art). Pokémon: set code and number, else (sets Limitless and the card
 * data code differently) the name, preferring a Standard-legal printing.
 */
function limitlessIndex(gameId: 'onepiece' | 'pokemon') {
  return (cards: Iterable<Card>): Map<string, Card> => {
    const out = new Map<string, Card>()
    const better = (a: Card | undefined, b: Card) =>
      !a ||
      (gameId === 'onepiece' ? b.id.length < a.id.length : a.legality?.standard !== 'legal' && b.legality?.standard === 'legal')
    for (const card of cards) {
      if (card.gameId !== gameId) continue
      const keys =
        gameId === 'onepiece'
          ? [limitlessKey(card.sourceId.slice(0, card.sourceId.lastIndexOf('-')), card.sourceId.slice(card.sourceId.lastIndexOf('-') + 1)), nameKey(card.name)]
          : [limitlessKey(card.setCode, card.number), nameKey(card.name)]
      for (const key of keys) if (better(out.get(key), card)) out.set(key, card)
    }
    return out
  }
}

/** A Limitless card: by set and number, else by name. */
const lookup = (index: Map<string, Card>, c: { set: string; number: string; name?: string }) =>
  index.get(limitlessKey(c.set, c.number)) ?? (c.name ? index.get(nameKey(c.name)) : undefined)

function limitlessDeck(list: CommunityList, index: Map<string, Card>): ListCards {
  const zones: Record<string, DeckCardEntry[]> = {}
  let missing = 0
  for (const c of list.cards ?? []) {
    const card = lookup(index, c)
    if (!card) {
      missing += c.count
      continue
    }
    const entries = (zones[c.zone] ??= [])
    const seen = entries.find((e) => e.cardId === card.id)
    if (seen) seen.quantity += c.count
    else entries.push({ cardId: card.id, quantity: c.count })
  }
  if (!Object.keys(zones).length || missing > 4) throw new Error(`${missing} cards not in the card data`)
  return { zones, freeTextZones: {} }
}

function limitlessGame(gameId: 'onepiece' | 'pokemon'): CommunityGame {
  return {
    gameId,
    fileUrl: COMMUNITY_FILE_URL.replace('riftbound.json', `${gameId}.json`),
    sourceUrl: limitlessSite(gameId),
    formatId: 'standard',
    identityZone: gameId === 'onepiece' ? 'leader' : null,
    index: limitlessIndex(gameId),
    artCard: (index, list) => (list.art ? lookup(index, list.art) : undefined),
    toDeck: limitlessDeck,
    toText: (list, cardsById, index) => {
      const deck = limitlessDeck(list, index)
      return getAdapter(gameId).formatDecklistText({ ...deck, id: '', gameId, name: '', formatId: 'standard', createdAt: '', updatedAt: '' } as Deck, cardsById)
    },
  }
}

const GAMES: Record<CommunityGameId, CommunityGame> = {
  riftbound: {
    gameId: 'riftbound',
    fileUrl: COMMUNITY_FILE_URL,
    sourceUrl: COMMUNITY_LISTS_URL,
    formatId: 'constructed',
    identityZone: 'legend',
    index: codeIndex,
    artCard: (index, list) => cardForCode(index, list.legendId),
    toDeck: (list, index) => deckCodeToCards(list.deckCode, index),
    toText: (list, cardsById, index) => deckCodeToText(list.deckCode, cardsById.values(), index),
  },
  onepiece: limitlessGame('onepiece'),
  pokemon: limitlessGame('pokemon'),
}

export const communityGame = (gameId: CommunityGameId): CommunityGame => GAMES[gameId]

/** Riftbound's lists were published before the others and carry no gameId. */
export const listGame = (list: CommunityList): CommunityGameId => (list.gameId && isCommunityGame(list.gameId) ? list.gameId : 'riftbound')

// ---------- which lists a deck of yours is like ----------

/** Below this share of copies in common with an archetype's lists, a Pokémon deck isn't counted as it. */
const MIN_ARCHETYPE_OVERLAP = 0.35

/** Copies by card name, the identity zone aside. */
function copiesByName(deck: ListCards, cardsById: Map<string, Card>, identityZone: string | null): Map<string, number> {
  const out = new Map<string, number>()
  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    if (zoneId === identityZone || zoneId === 'sideboard') continue
    for (const e of entries) {
      const card = cardsById.get(e.cardId)
      if (card) out.set(normalizeName(card.name), (out.get(normalizeName(card.name)) ?? 0) + e.quantity)
    }
  }
  return out
}

/** The share of the deck's copies a list plays too (0-1). */
function overlap(mine: Map<string, number>, theirs: Map<string, number>): number {
  let total = 0
  let shared = 0
  for (const [name, n] of mine) {
    total += n
    shared += Math.min(n, theirs.get(name) ?? 0)
  }
  return total ? shared / total : 0
}

/**
 * The archetype (CommunityList.legendId) a deck of yours is: the one with its Legend or Leader, or
 * for Pokémon the archetype whose lists share the most of its cards (the best few lists' average),
 * when enough do. Null when none fits.
 */
export function archetypeOf(game: CommunityGame, deck: ListCards, cardsById: Map<string, Card>, lists: readonly CommunityList[], index: Map<string, Card>): string | null {
  if (game.identityZone) {
    const identity = cardsById.get(deck.zones[game.identityZone]?.[0]?.cardId ?? '')
    if (!identity) return null
    const key = poolKey(identity)
    return lists.find((l) => {
      const card = game.artCard(index, l)
      return card && poolKey(card) === key
    })?.legendId ?? null
  }
  const mine = copiesByName(deck, cardsById, null)
  if (!mine.size) return null
  const scores = new Map<string, number[]>()
  for (const list of lists) {
    let theirs: Map<string, number>
    try {
      theirs = copiesByName(game.toDeck(list, index), cardsById, null)
    } catch {
      continue
    }
    const s = scores.get(list.legendId) ?? scores.set(list.legendId, []).get(list.legendId)!
    s.push(overlap(mine, theirs))
  }
  let best: { id: string; score: number } | null = null
  for (const [id, s] of scores) {
    const top = s.sort((a, b) => b - a).slice(0, 3)
    const score = top.reduce((a, b) => a + b, 0) / top.length
    if (!best || score > best.score) best = { id, score }
  }
  return best && best.score >= MIN_ARCHETYPE_OVERLAP ? best.id : null
}
