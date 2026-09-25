/**
 * The app's UI text in English and Spanish. Every visible string reads from `t`, e.g. `t.sidebar.newDeck`
 * or `t.deck.cardCount(n)`. Card names, card text, card types and set/format names stay as the card data has
 * them (there's no Spanish source for them), and so does exported decklist text, which other sites import.
 *
 * `t` is a live binding: setLanguage() swaps it, and the app re-mounts its screens on a language change
 * (App.tsx keys them on the language) so everything picks the new one up.
 */
import { en, type Messages } from './en'
import { es } from './es'

export type Language = 'en' | 'es'

export const LANGUAGES: readonly { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
]

const MESSAGES: Record<Language, Messages> = { en, es }

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'es'
}

let current: Language = 'en'

export let t: Messages = en

export function setLanguage(language: Language): void {
  current = language
  t = MESSAGES[language]
}

export function getLanguage(): Language {
  return current
}

/** Spanish for a browser/OS language starting with "es" (es, es-MX, es-419...), English otherwise. */
export function languageFromLocale(locale: string | null | undefined): Language {
  return locale?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** A deck zone's name ("Main Deck", "Leader"...) in the current language, falling back to the game's own label. */
export function zoneLabel(label: string): string {
  return t.zones[label] ?? label
}

export type { Messages }
