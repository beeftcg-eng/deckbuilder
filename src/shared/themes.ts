/** The app's colour themes. Each one is a value for every CSS variable in index.css, applied in one go (lib/theme.ts). */

export interface ThemeColors {
  bg: string
  bgElevated: string
  bgElevated2: string
  border: string
  borderStrong: string
  text: string
  textDim: string
  accent: string
  accentDim: string
  /** Text drawn on top of the accent colour (primary buttons, badges). */
  accentText: string
  danger: string
  dangerDim: string
  success: string
  warning: string
}

export interface Theme {
  id: string
  label: string
  /** Tells the browser which native form-control / scrollbar style to use. */
  scheme: 'dark' | 'light'
  colors: ThemeColors
}

export const THEMES: readonly Theme[] = [
  {
    id: 'midnight', label: 'Midnight', scheme: 'dark',
    colors: { bg: '#14151a', bgElevated: '#1c1e26', bgElevated2: '#242631', border: '#33364433', borderStrong: '#3d4155', text: '#e8e9ee', textDim: '#9a9db3', accent: '#7c9eff', accentDim: '#4a5c8f', accentText: '#10131f', danger: '#ff6b6b', dangerDim: '#4a2a2a', success: '#5fd68a', warning: '#ffb454' },
  },
  {
    id: 'graphite', label: 'Graphite & Amber', scheme: 'dark',
    colors: { bg: '#161616', bgElevated: '#202020', bgElevated2: '#2b2b2b', border: '#3a3a3a55', borderStrong: '#4a4a4a', text: '#ececec', textDim: '#a3a3a3', accent: '#e8a94f', accentDim: '#7a5a2a', accentText: '#1a1206', danger: '#ff6b6b', dangerDim: '#4a2a2a', success: '#6fd68a', warning: '#ffd166' },
  },
  {
    id: 'forest', label: 'Forest', scheme: 'dark',
    colors: { bg: '#0f1712', bgElevated: '#16211a', bgElevated2: '#1e2c23', border: '#2f4a3855', borderStrong: '#3a5a45', text: '#e4efe6', textDim: '#98b0a0', accent: '#6fcf97', accentDim: '#2f6b4a', accentText: '#07140c', danger: '#ff7b6b', dangerDim: '#4a2a26', success: '#8bdc7a', warning: '#ffb454' },
  },
  {
    id: 'royal', label: 'Royal Purple', scheme: 'dark',
    colors: { bg: '#150f1f', bgElevated: '#1f172d', bgElevated2: '#2a203c', border: '#4a3a6a55', borderStrong: '#54427a', text: '#eee8f7', textDim: '#ab9fc4', accent: '#b794ff', accentDim: '#5f4a94', accentText: '#150f1f', danger: '#ff6b8a', dangerDim: '#4a2a36', success: '#5fd68a', warning: '#ffb454' },
  },
  {
    id: 'crimson', label: 'Crimson', scheme: 'dark',
    colors: { bg: '#1a1012', bgElevated: '#251719', bgElevated2: '#311f22', border: '#5a343955', borderStrong: '#6a3f45', text: '#f4e9ea', textDim: '#b89ea1', accent: '#ff6b7d', accentDim: '#8a3a46', accentText: '#1a0a0c', danger: '#ff9f43', dangerDim: '#4a3020', success: '#5fd68a', warning: '#ffd166' },
  },
  {
    id: 'ocean', label: 'Ocean', scheme: 'dark',
    colors: { bg: '#0d1a20', bgElevated: '#132630', bgElevated2: '#1a3441', border: '#2f5a6b55', borderStrong: '#37687a', text: '#e3f1f5', textDim: '#8fb3be', accent: '#4fd1c5', accentDim: '#256b66', accentText: '#04181a', danger: '#ff7b6b', dangerDim: '#4a2a26', success: '#7fe0a0', warning: '#ffb454' },
  },
  {
    id: 'light', label: 'Light', scheme: 'light',
    colors: { bg: '#f4f5f8', bgElevated: '#ffffff', bgElevated2: '#eceef4', border: '#00000018', borderStrong: '#c3c8d6', text: '#1d2030', textDim: '#565c72', accent: '#3559d0', accentDim: '#c4d0f5', accentText: '#ffffff', danger: '#c62828', dangerDim: '#fbe1e1', success: '#1c7c45', warning: '#9a5b00' },
  },
  {
    id: 'parchment', label: 'Parchment', scheme: 'light',
    colors: { bg: '#f2e9d8', bgElevated: '#faf4e6', bgElevated2: '#ebe0c9', border: '#00000018', borderStrong: '#c9bb99', text: '#2b2416', textDim: '#66593f', accent: '#9c3d2a', accentDim: '#e6c8bc', accentText: '#ffffff', danger: '#b3261e', dangerDim: '#f6ddd8', success: '#2f7a3f', warning: '#8f5a00' },
  },
]

export const DEFAULT_THEME_ID = 'midnight'

export function isThemeId(value: unknown): value is string {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

export function getTheme(id: string | null | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** The CSS variables (see index.css) a theme sets, name -> value. */
export function themeVariables(theme: Theme): Record<string, string> {
  const c = theme.colors
  return {
    '--bg': c.bg,
    '--bg-elevated': c.bgElevated,
    '--bg-elevated-2': c.bgElevated2,
    '--border': c.border,
    '--border-strong': c.borderStrong,
    '--text': c.text,
    '--text-dim': c.textDim,
    '--accent': c.accent,
    '--accent-dim': c.accentDim,
    '--accent-text': c.accentText,
    '--danger': c.danger,
    '--danger-dim': c.dangerDim,
    '--success': c.success,
    '--warning': c.warning,
  }
}

// ---- contrast (WCAG), used by the tests so a new palette can't ship unreadable ----

function channel(hex: string, offset: number): number {
  const v = parseInt(hex.slice(offset, offset + 2), 16) / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** WCAG contrast ratio of two #rrggbb colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
