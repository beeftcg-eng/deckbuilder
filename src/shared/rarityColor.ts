/**
 * A rough color tier for a rarity string, purely for visual scanning (a CSS class, not a value
 * judgment) — text color, not a foil/shader effect on the card art itself. Keyword-matched rather
 * than an exact lookup table because rarity vocabulary varies a lot by game. Every Yu-Gi-Oh rarity
 * that appears on more than a handful of cards has its own color (Secret, Prismatic Secret, Quarter
 * Century, Starlight, Ghost, Collector's, Ultimate, the Platinum and Gold families, Parallel, Starfoil,
 * Shatterfoil, Mosaic, Short Print...); other games' secret-family rarities (Magic's Mythic) share Secret's. Checked in order, most specific first, so e.g. "Quarter Century
 * Secret Rare" isn't caught by the generic "secret" rule and "Ultra Rare" doesn't fall to "rare".
 */
export function rarityColorClass(rarity: string | null): string {
  if (!rarity) return 'rarity-color-none'
  const r = rarity.toLowerCase()
  const tier =
    /quarter century/.test(r) ? 'qcsr'
    : /starlight|10000/.test(r) ? 'starlight'
    : /ghost/.test(r) ? 'ghost'
    : /collector/.test(r) ? 'collector'
    : /grand master/.test(r) ? 'grand-master'
    : /pharaoh/.test(r) ? 'pharaoh'
    : /ultimate/.test(r) ? 'ultimate'
    : /prismatic/.test(r) ? 'prismatic'
    : /extra secret/.test(r) ? 'extra-secret'
    : /platinum secret/.test(r) ? 'platinum'
    : /platinum/.test(r) ? 'platinum-rare'
    : /gold secret/.test(r) ? 'gold-secret'
    : /premium gold/.test(r) ? 'premium-gold'
    : /gold/.test(r) ? 'gold'
    : /parallel/.test(r) ? 'parallel'
    : /shatterfoil/.test(r) ? 'shatterfoil'
    : /starfoil/.test(r) ? 'starfoil'
    : /mosaic/.test(r) ? 'mosaic'
    : /short print/.test(r) ? 'short-print'
    : /secret|mythic/.test(r) ? 'top'
    : /ultra/.test(r) ? 'high'
    : /super/.test(r) ? 'upper-mid'
    : /\brare\b|holo/.test(r) ? 'mid'
    : /uncommon/.test(r) ? 'uncommon'
    : 'common'
  return `rarity-color-${tier}`
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
  shatterfoil: { dark: '#fb705b', light: '#c21e05' },
  prismatic: { dark: '#e364f7', light: '#a50abd' },
  parallel: { dark: '#8393fc', light: '#2e49fa' },
  'platinum-rare': { dark: '#779ec5', light: '#3c638b' },
  mosaic: { dark: '#1fb244', light: '#14712b' },
  starfoil: { dark: '#7fb319', light: '#4c6b0f' },
  'premium-gold': { dark: '#ad9f1f', light: '#6c6313' },
  'gold-secret': { dark: '#cc9600', light: '#7a5a00' },
  'extra-secret': { dark: '#ff6d2e', light: '#b23600' },
  'grand-master': { dark: '#f76e79', light: '#c20a19' },
  pharaoh: { dark: '#d28a4b', light: '#8b5323' },
  'short-print': { dark: '#b29770', light: '#745e3e' },
}
