import type { Card } from './types'

/**
 * Which printing of a card to use when all a decklist says is its name. Card catalogs list every printing
 * (a Common, a Promo, an alternate-art Showcase…) and the API order is arbitrary, so "the first one" used
 * to hand back whatever happened to come first — often the Promo or the most expensive art.
 */

// Lower = plainer. The tables cover the rarity names the four games' data use; anything unknown lands in the
// middle, so it never beats a known Common but doesn't beat a known Promo either.
const RARITY_RANK: Record<string, number> = {
  // Magic, Riftbound, Pokémon
  common: 0, uncommon: 1, rare: 2, epic: 3, mythic: 4, legendary: 4, special: 5, bonus: 5,
  'rare holo': 3, 'double rare': 3, 'ace spec rare': 3, 'rare holo ex': 4, 'rare holo gx': 4, 'rare holo v': 4,
  'rare holo vmax': 4, 'rare holo vstar': 4, 'rare ultra': 5, 'ultra rare': 5, 'illustration rare': 6,
  'rare secret': 6, 'special illustration rare': 7, 'hyper rare': 7, 'rare rainbow': 7, showcase: 6, promo: 7,
  // One Piece
  c: 0, uc: 1, r: 2, l: 2, sr: 3, sec: 5, tr: 5, pr: 7, p: 7,
}
const UNKNOWN_RANK = 4

export function rarityRank(rarity: string | null): number {
  const key = (rarity ?? '').trim().toLowerCase()
  if (key === '') return UNKNOWN_RANK
  if (key in RARITY_RANK) return RARITY_RANK[key]
  if (/special illustration|hyper|rainbow|secret/.test(key)) return 7
  if (/illustration|showcase|promo/.test(key)) return 6
  if (/ultra|full art/.test(key)) return 5
  if (/holo/.test(key)) return 3
  return UNKNOWN_RANK
}

/** An alternate-art, parallel or promo version of a card, as opposed to its regular printing. */
export function isAlternateArt(card: Card): boolean {
  if (/_p\d+$/i.test(card.id)) return true // One Piece parallels: onepiece:OP01-003_p1
  if (card.sourceId.includes('*')) return true // Riftbound alternate numbering: unl-229*-219
  const rarity = (card.rarity ?? '').toLowerCase()
  return ['showcase', 'promo', 'pr', 'p'].includes(rarity) || rarity.includes('alternate') || rarity.includes('alt art')
}

export interface PrintingPrefs {
  /** Copies of this exact printing you own. */
  owned?: (card: Card) => number
  /** Whether the printing is legal in the deck's format (matters when reprints differ, e.g. One Piece rotation). */
  legal?: (card: Card) => boolean
}

/**
 * The best printing among `cards`: legal in the format first, then one you already own (so an imported list
 * uses the cards you actually have), then a regular one over alternate art, then the lowest rarity; ties keep
 * the catalog's order. Undefined for an empty list.
 */
export function choosePrinting(cards: readonly Card[] | undefined, prefs: PrintingPrefs = {}): Card | undefined {
  if (!cards || cards.length === 0) return undefined
  const key = (card: Card): number[] => [
    prefs.legal && !prefs.legal(card) ? 1 : 0,
    prefs.owned && prefs.owned(card) > 0 ? 0 : 1,
    isAlternateArt(card) ? 1 : 0,
    rarityRank(card.rarity),
  ]
  let best = cards[0]
  let bestKey = key(best)
  for (let i = 1; i < cards.length; i++) {
    const candidate = key(cards[i])
    for (let j = 0; j < candidate.length; j++) {
      if (candidate[j] === bestKey[j]) continue
      if (candidate[j] < bestKey[j]) {
        best = cards[i]
        bestKey = candidate
      }
      break
    }
  }
  return best
}
