/**
 * A rough color tier for a rarity string, purely for visual scanning (a CSS class, not a value
 * judgment) — text color, not a foil/shader effect on the card art itself. Keyword-matched rather
 * than an exact lookup table because rarity vocabulary varies a lot by game. Yu-Gi-Oh's premium
 * rarities (Quarter Century Secret, Starlight, Ghost, Collector's, Ultimate, Platinum, Gold) each get
 * their own color; any other "secret"-family rarity (Secret, Prismatic Secret, Ultra Secret, Magic's
 * Mythic...) shares the top tier. Checked in order, most specific first, so e.g. "Quarter Century
 * Secret Rare" isn't caught by the generic "secret" rule and "Ultra Rare" doesn't fall to "rare".
 */
export function rarityColorClass(rarity: string | null): string {
  if (!rarity) return 'rarity-color-none'
  const r = rarity.toLowerCase()
  if (/quarter century/.test(r)) return 'rarity-color-qcsr'
  if (/starlight|10000/.test(r)) return 'rarity-color-starlight'
  if (/ghost/.test(r)) return 'rarity-color-ghost'
  if (/collector/.test(r)) return 'rarity-color-collector'
  if (/ultimate/.test(r)) return 'rarity-color-ultimate'
  if (/platinum/.test(r)) return 'rarity-color-platinum'
  if (/gold/.test(r)) return 'rarity-color-gold'
  if (/secret|prismatic|mythic/.test(r)) return 'rarity-color-top'
  if (/ultra/.test(r)) return 'rarity-color-high'
  if (/super/.test(r)) return 'rarity-color-upper-mid'
  if (/\brare\b|holo/.test(r)) return 'rarity-color-mid'
  if (/uncommon/.test(r)) return 'rarity-color-uncommon'
  return 'rarity-color-common'
}

/**
 * Colors for the tiers that don't reuse a theme color, one for dark themes and a deeper one for light
 * themes (the old fixed yellow was hard to read on Light/Parchment). applyTheme sets them as
 * `--rarity-<tier>` variables; rarityColor.test.ts checks each against every theme's backgrounds.
 */
export const RARITY_COLORS: Record<string, { dark: string; light: string }> = {
  'upper-mid': { dark: '#b98cff', light: '#6a3fc2' },
  top: { dark: '#ffd54a', light: '#735600' },
  qcsr: { dark: '#ff8fbf', light: '#a8235a' },
  starlight: { dark: '#8fd3ff', light: '#1a5c90' },
  ghost: { dark: '#cdeee9', light: '#35615b' },
  collector: { dark: '#4fe0c8', light: '#0b6e61' },
  ultimate: { dark: '#e8a468', light: '#8a4513' },
  platinum: { dark: '#cfd6e6', light: '#4a5263' },
  gold: { dark: '#f2a93b', light: '#7d4a00' },
}
