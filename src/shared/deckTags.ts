import type { Card, Deck } from './types'
import { poolKey } from './collection'

/**
 * Your own labels on the cards in a deck ("ramp", "removal", "draw"), the way Commander players sort a
 * list. Kept on the deck by card (collection.ts poolKey, so every printing of a card shares them),
 * synced with it and shown on share links. The deck view can group by them (deckView.ts).
 */

export const MAX_TAGS_PER_CARD = 8
const MAX_TAG_LENGTH = 30

export function tagsOf(deck: Pick<Deck, 'tags'>, card: Card): string[] {
  return deck.tags?.[poolKey(card)] ?? []
}

/** Trimmed, at most 30 characters, no repeats (ignoring case), at most eight. */
export function cleanTags(tags: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_TAGS_PER_CARD) break
  }
  return out
}

/** "ramp, removal; draw" -> ["ramp", "removal", "draw"]. */
export function parseTags(text: string): string[] {
  return cleanTags(text.split(/[,;\n]/))
}

/** The deck with this card's tags replaced (none removes the card's entry). */
export function withTags(deck: Deck, card: Card, tags: readonly string[]): Deck {
  const clean = cleanTags(tags)
  const key = poolKey(card)
  const next = { ...deck.tags }
  if (clean.length) next[key] = clean
  else delete next[key]
  const { tags: _old, ...rest } = deck
  return Object.keys(next).length ? { ...rest, tags: next } : rest
}

/** Every tag used in the deck, most used first (for suggestions), spelled as first used. */
export function allTags(deck: Pick<Deck, 'tags'>): string[] {
  const counts = new Map<string, { tag: string; n: number }>()
  for (const tags of Object.values(deck.tags ?? {})) {
    for (const tag of tags) {
      const key = tag.toLowerCase()
      const had = counts.get(key)
      if (had) had.n++
      else counts.set(key, { tag, n: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)).map((c) => c.tag)
}

/** Only well-formed tags, for a deck read from a share link. */
export function sanitizeTags(raw: unknown): Record<string, string[]> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const out: Record<string, string[]> = {}
  for (const [key, tags] of Object.entries(raw as Record<string, unknown>).slice(0, 500)) {
    if (!Array.isArray(tags)) continue
    const clean = cleanTags(tags.filter((t): t is string => typeof t === 'string'))
    if (clean.length) out[key] = clean
  }
  return Object.keys(out).length ? out : undefined
}
