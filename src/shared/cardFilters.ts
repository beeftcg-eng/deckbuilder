import type { Card } from './types'

/**
 * The card browser's Type and Kind chips. A type is a card category (Monster/Spell/Trap, Creature/
 * Instant/Enchantment, Pokémon/Trainer/Energy, Unit/Spell/Battlefield...). For Magic a card has one
 * category but can be several types - an Enchantment Creature is filed as Creature with Enchantment in
 * its subtypes - so a type also matches a subtype of the same name. A kind is one of the game's
 * curated subtypes (FILTER_KINDS). Several chips in one row widen the search (any of them); the two
 * rows narrow each other (a type AND a kind).
 */
export function matchesTypes(card: Card, types: ReadonlySet<string>): boolean {
  return types.size === 0 || types.has(card.category) || card.subtypes.some((s) => types.has(s))
}

export function matchesKinds(card: Card, kinds: ReadonlySet<string>): boolean {
  return kinds.size === 0 || card.subtypes.some((s) => kinds.has(s))
}

/** The types to offer as chips: every category in the catalog, in the game's usual order when it has one. */
export function typeOptions(cards: Card[], order: readonly string[] = []): string[] {
  const seen = [...new Set(cards.map((c) => c.category))]
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length)
  return seen.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** The kinds to offer as chips: the game's curated list, limited to ones some card in the catalog has. */
export function kindOptions(cards: Card[], curated: readonly string[] = []): string[] {
  if (curated.length === 0) return []
  const present = new Set(cards.flatMap((c) => c.subtypes))
  return curated.filter((k) => present.has(k))
}
