/**
 * A rough color tier for a rarity string, purely for visual scanning (a CSS class, not a value
 * judgment) — text color, not a foil/shader effect on the card art itself. Keyword-matched rather
 * than an exact lookup table because rarity vocabulary varies a lot by game and, for Yu-Gi-Oh
 * specifically, includes many "Secret Rare"-family variants (Prismatic Secret, Starlight, Quarter
 * Century Secret, Collector's...) that should all read as "top tier" without enumerating each one.
 * Checked in order, most-specific/highest tier first, so e.g. "Ultra Rare" doesn't fall through to
 * the generic "rare" tier below it.
 */
export function rarityColorClass(rarity: string | null): string {
  if (!rarity) return 'rarity-color-none'
  const r = rarity.toLowerCase()
  if (/secret|starlight|collector|prismatic|ghost|ultimate|platinum|gold|mythic/.test(r)) return 'rarity-color-top'
  if (/ultra/.test(r)) return 'rarity-color-high'
  if (/super/.test(r)) return 'rarity-color-upper-mid'
  if (/\brare\b|holo/.test(r)) return 'rarity-color-mid'
  if (/uncommon/.test(r)) return 'rarity-color-uncommon'
  return 'rarity-color-common'
}
