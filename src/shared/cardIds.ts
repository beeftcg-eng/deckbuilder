import type { Card } from './types'
import { isAlternateArt, rarityRank } from './printings'

/** The file name of a card's image without folders, query or extension: ".../Card_Images/OP01-006_p5.jpg?v=2" -> "OP01-006_p5". */
function imageStem(card: Card): string {
  const file = (card.imageUrl ?? '').split(/[?#]/)[0].split('/').pop() ?? ''
  return file.replace(/\.[A-Za-z0-9]+$/, '')
}

/** An image file marked as a parallel/reprint upload: "OP01-006_p5", "OP03-081_p1_cCn0Rtb", "OP01-006_r1". */
const ALTERNATE_IMAGE = /_[pr]\d+(?:_|$)/

/**
 * A name that carries a printing qualifier — "(Alternate Art)", "(Reprint)", "(Dash Pack)", "(TR)" — as opposed
 * to just the card number in parentheses, which the regular printing has too: "Kalifa (081)", "Law (ST10-010)".
 */
function hasPrintingQualifier(card: Card): boolean {
  const withoutNumbers = card.name.replace(/\(\s*(?:[A-Za-z]{1,4}\d*-)?\d+\s*\)/g, '')
  return /\([^)]+\)/.test(withoutNumbers)
}

/**
 * Lower is more "regular": the plain "<id>.jpg" image, then any image not marked as a parallel/reprint, then a
 * name with no qualifier, then (One Piece's signals having found nothing) the same alternate-art/rarity ranking
 * `printings.ts` uses for import — the only signal that discriminates Magic's unique-artwork printings, whose
 * image files are just Scryfall's own per-printing UUID and never carry a One-Piece-style parallel/reprint tag.
 */
function regularness(card: Card, plain: string): number[] {
  const stem = imageStem(card)
  return [
    stem === plain ? 0 : 1,
    ALTERNATE_IMAGE.test(stem) ? 1 : 0,
    hasPrintingQualifier(card) ? 1 : 0,
    isAlternateArt(card) ? 1 : 0,
    rarityRank(card.rarity),
  ]
}

/**
 * Makes every card id unique. A deck, the collection and the wishlist store only a card's id and find the card
 * again by looking it up, so two printings sharing an id are indistinguishable: adding the regular card puts
 * whichever duplicate the lookup keeps — usually an alternate art — into the deck. One Piece's data does this
 * (a card, its reprints, foils and alternate arts can all come back with one id); Magic's normalizeCard does it
 * on purpose, keying every printing by its oracle id, specifically so this function is what splits them apart.
 *
 * Ids that are already unique are never touched, so everything saved against them still resolves. Within a group
 * of duplicates the most regular printing keeps the id (see regularness; ties go to the first listed); the others
 * get an id from their own image file name, which is different for every printing. Deterministic (same input,
 * same ids), and returns the same array when there is nothing to fix.
 */
export function uniquifyCardIds(cards: Card[]): Card[] {
  const groups = new Map<string, number[]>()
  cards.forEach((card, index) => {
    const list = groups.get(card.id)
    if (list) list.push(index)
    else groups.set(card.id, [index])
  })
  if (![...groups.values()].some((indices) => indices.length > 1)) return cards

  const taken = new Set(groups.keys())
  const result = cards.slice()
  for (const [id, indices] of groups) {
    if (indices.length < 2) continue
    const plain = id.slice(id.indexOf(':') + 1)
    let owner = indices[0]
    let best = regularness(cards[owner], plain)
    for (const i of indices.slice(1)) {
      const candidate = regularness(cards[i], plain)
      const better = candidate.findIndex((v, j) => v !== best[j])
      if (better !== -1 && candidate[better] < best[better]) {
        owner = i
        best = candidate
      }
    }
    for (const index of indices) {
      if (index === owner) continue
      const card = cards[index]
      const stem = imageStem(card)
      // Yu-Gi-Oh folds rarity into the fallback key alongside the set, not just as a last-resort
      // `~2`/`~3` counter: two real printings that share a set code but differ only by rarity (rare
      // but it happens) get a stable, rarity-qualified id instead of an arbitrary numeric suffix.
      // Scoped to Yu-Gi-Oh only - changing this for other games would change ids their existing
      // saved decks/collections/wishlists already point at.
      const base =
        stem && stem !== plain
          ? `${card.gameId}:${stem}`
          : card.gameId === 'yugioh'
            ? `${id}~${card.setId}~${card.rarity ?? 'none'}`
            : `${id}~${card.setId}`
      let candidate = base
      for (let n = 2; taken.has(candidate); n++) candidate = `${base}~${n}`
      taken.add(candidate)
      result[index] = { ...card, id: candidate }
    }
  }
  return result
}
