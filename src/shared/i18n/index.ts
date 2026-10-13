/**
 * The app's UI text in English, Spanish and Brazilian Portuguese. Every visible string reads from `t`, e.g. `t.sidebar.newDeck`
 * or `t.deck.cardCount(n)`. Card names, card text, card types and set/format names stay as the card data has
 * them (there's no Spanish source for them), and so does exported decklist text, which other sites import.
 *
 * `t` is a live binding: setLanguage() swaps it, and the app re-mounts its screens on a language change
 * (App.tsx keys them on the language) so everything picks the new one up.
 *
 * English is built in; Spanish and Portuguese load when first used (loadLanguage), so the phone app
 * doesn't download languages nobody on that device reads. The desktop app's main process imports
 * ./all, which has them all.
 */
import { en, type Messages } from './en'

export type Language = 'en' | 'es' | 'pt'

export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'pt', label: 'Português' },
]

const MESSAGES: Partial<Record<Language, Messages>> = { en }

/** Makes a language's text available (./all does it for every language at once). */
export function registerMessages(language: Language, messages: Messages): void {
  MESSAGES[language] = messages
}

/** Loads a language's text if it isn't yet; setLanguage then switches to it straight away. */
export async function loadLanguage(language: Language): Promise<void> {
  if (MESSAGES[language]) return
  if (language === 'es') registerMessages('es', (await import('./es')).es)
  else if (language === 'pt') registerMessages('pt', (await import('./pt')).pt)
}

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'es' || value === 'pt'
}

let current: Language = 'en'

export let t: Messages = en

/** Switches to `language`, if its text is loaded (loadLanguage); English otherwise. */
export function setLanguage(language: Language): void {
  current = MESSAGES[language] ? language : 'en'
  t = MESSAGES[current]!
}

export function getLanguage(): Language {
  return current
}

/** Spanish for a browser/OS language starting with "es" (es, es-MX, es-419...), Portuguese for "pt" (pt-BR, pt-PT), English otherwise. */
export function languageFromLocale(locale: string | null | undefined): Language {
  const code = locale?.toLowerCase() ?? ''
  return code.startsWith('es') ? 'es' : code.startsWith('pt') ? 'pt' : 'en'
}

/** A deck zone's name ("Main Deck", "Leader"...) in the current language, falling back to the game's own label. */
export function zoneLabel(label: string): string {
  return t.zones[label] ?? label
}

export type { Messages }
