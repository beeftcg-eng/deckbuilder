import type { Deck, DeckCardEntry, DeckFreeTextEntry, DeckVersion } from './types'

/**
 * A deck's earlier lists. A version is saved by itself when an editing session starts on a deck
 * that hasn't changed for a while (the list as it stood before the new round of changes), and by
 * hand with a name ("after regionals"). They're kept on the deck, so they sync with it; share links
 * leave them out (deckShare.ts reads only the list).
 */

export const MAX_VERSIONS = 30
/** Edits this long after the deck last changed start a new session, which saves the list first. */
export const SESSION_GAP_MS = 30 * 60 * 1000

type ListOf = Pick<Deck, 'formatId' | 'zones' | 'freeTextZones'>

function canonical<T extends { quantity: number }>(zones: Record<string, T[]> | undefined, key: (e: T) => string): string {
  const out: string[] = []
  for (const zoneId of Object.keys(zones ?? {}).sort()) {
    const merged = new Map<string, number>()
    for (const e of zones![zoneId]) if (e.quantity > 0) merged.set(key(e), (merged.get(key(e)) ?? 0) + e.quantity)
    if (merged.size) out.push(`${zoneId}:${[...merged].sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${n}x${k}`).join(',')}`)
  }
  return out.join('|')
}

/** The list as a string that's equal for equal lists, whatever order the cards were added in. */
export function listKey(deck: ListOf): string {
  return `${deck.formatId}#${canonical<DeckCardEntry>(deck.zones, (e) => e.cardId)}#${canonical<DeckFreeTextEntry>(deck.freeTextZones, (e) => e.label)}`
}

export function isEmptyList(deck: ListOf): boolean {
  return listKey(deck) === `${deck.formatId}##`
}

/** Keeps the newest MAX_VERSIONS, dropping unnamed versions before named ones. */
function capped(versions: DeckVersion[]): DeckVersion[] {
  const out = [...versions]
  while (out.length > MAX_VERSIONS) {
    const unnamed = out.findIndex((v) => !v.name)
    out.splice(unnamed >= 0 ? unnamed : 0, 1)
  }
  return out
}

/**
 * The deck with its current list saved as a version. With no name, nothing changes when the newest
 * version already has this list; with a name, that version is renamed instead of duplicated.
 */
export function withVersion(deck: Deck, options: { id: string; at: string; name?: string }): Deck {
  const versions = deck.versions ?? []
  const last = versions.at(-1)
  const name = options.name?.trim().slice(0, 80) || undefined
  if (last && listKey(last) === listKey(deck)) {
    if (!name || last.name === name) return deck
    return { ...deck, versions: [...versions.slice(0, -1), { ...last, name }] }
  }
  const version: DeckVersion = {
    id: options.id,
    at: options.at,
    ...(name ? { name } : {}),
    formatId: deck.formatId,
    zones: structuredClone(deck.zones),
    freeTextZones: structuredClone(deck.freeTextZones ?? {}),
  }
  return { ...deck, versions: capped([...versions, version]) }
}

/**
 * Before an edit: whether the list as it stands should be saved first, because this edit starts a
 * new session (the deck last changed over SESSION_GAP_MS ago) and the list isn't saved yet.
 */
export function shouldSaveBeforeEdit(deck: Deck, now: number): boolean {
  if (isEmptyList(deck)) return false
  const last = deck.versions?.at(-1)
  if (last && listKey(last) === listKey(deck)) return false
  const changed = Date.parse(deck.updatedAt)
  return !Number.isFinite(changed) || now - changed >= SESSION_GAP_MS
}

/** The deck with a version's list (and format) put back. The rest of the deck is untouched. */
export function withVersionRestored(deck: Deck, version: DeckVersion): Deck {
  return { ...deck, formatId: version.formatId, zones: structuredClone(version.zones), freeTextZones: structuredClone(version.freeTextZones) }
}

export function withoutVersion(deck: Deck, versionId: string): Deck {
  const versions = (deck.versions ?? []).filter((v) => v.id !== versionId)
  if (versions.length === (deck.versions ?? []).length) return deck
  const { versions: _old, ...rest } = deck
  return versions.length ? { ...rest, versions } : rest
}

export function withVersionName(deck: Deck, versionId: string, name: string): Deck {
  const trimmed = name.trim().slice(0, 80)
  return {
    ...deck,
    versions: (deck.versions ?? []).map((v) => {
      if (v.id !== versionId) return v
      const { name: _old, ...rest } = v
      return trimmed ? { ...rest, name: trimmed } : rest
    }),
  }
}
