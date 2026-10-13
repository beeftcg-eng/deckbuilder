import { isLanguage, languageFromLocale, loadLanguage, setLanguage, type Language } from '../shared/i18n'

const STORAGE_KEY = 'deckbuilder-language'

/** Switches the app's text to `language` (loading it first, if it's one of the ones that load on use) and remembers it locally for the next launch's first paint. */
export async function applyLanguage(language: Language): Promise<void> {
  await loadLanguage(language).catch(() => undefined)
  setLanguage(language)
  document.documentElement.lang = language
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Private mode / storage disabled: the saved setting still restores it a moment later.
  }
}

/**
 * Applied before the first render, like the theme: the local copy of the last choice, or on a first
 * launch the system's language (Spanish for any "es-*" locale, else English).
 */
export function applyCachedLanguage(): Promise<void> {
  let cached: string | null = null
  try {
    cached = localStorage.getItem(STORAGE_KEY)
  } catch {
    cached = null
  }
  return applyLanguage(isLanguage(cached) ? cached : languageFromLocale(typeof navigator === 'undefined' ? null : navigator.language))
}
