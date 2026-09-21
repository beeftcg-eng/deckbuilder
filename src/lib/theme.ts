import { DEFAULT_THEME_ID, getTheme, isThemeId, themeVariables } from '../shared/themes'

const STORAGE_KEY = 'deckbuilder-theme'

/** Paints a theme onto the page by setting the CSS variables every component already uses. */
export function applyTheme(id: string | null | undefined): void {
  const theme = getTheme(id)
  const root = document.documentElement
  for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value)
  root.style.setProperty('color-scheme', theme.scheme)
  root.dataset.theme = theme.id
  try {
    localStorage.setItem(STORAGE_KEY, theme.id)
  } catch {
    // Private mode / storage disabled: the saved setting still restores it a moment later.
  }
}

/** Applied before the first render from a local copy, so a non-default theme doesn't flash the default one while settings load. */
export function applyCachedTheme(): void {
  let cached: string | null = null
  try {
    cached = localStorage.getItem(STORAGE_KEY)
  } catch {
    cached = null
  }
  applyTheme(isThemeId(cached) ? cached : DEFAULT_THEME_ID)
}
