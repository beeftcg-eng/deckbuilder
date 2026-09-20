import type { Card, DeckCardEntry, DeckFreeTextEntry, DeckZoneRule } from './types'
import type { GameAdapter } from './games/types'
import { normalizeName } from './collection'

export interface ParsedDeck {
  /** Deck name from the first line, when the text is in this app's own export format. */
  name: string | null
  /** Format label from the export header line, if present. */
  formatLabel: string | null
  zones: Record<string, DeckCardEntry[]>
  freeTextZones: Record<string, DeckFreeTextEntry[]>
  /** Lines that started with a quantity but matched no card in the catalog. */
  unmatched: string[]
  /** Total copies recognised across all zones. */
  matchedCopies: number
}

interface CardIndex {
  bySource: Map<string, Card[]>
  byName: Map<string, Card[]>
  bySetNumber: Map<string, Card[]>
}

// Building the index walks the whole catalog (20k+ cards for Pokémon), and the
// import box re-parses on every keystroke, so it's built once per catalog.
const indexCache = new WeakMap<Map<string, Card>, CardIndex>()

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function indexFor(cardsById: Map<string, Card>): CardIndex {
  const cached = indexCache.get(cardsById)
  if (cached) return cached
  const index: CardIndex = { bySource: new Map(), byName: new Map(), bySetNumber: new Map() }
  for (const card of cardsById.values()) {
    push(index.bySource, card.sourceId.toLowerCase(), card)
    push(index.byName, normalizeName(card.name), card)
    push(index.bySetNumber, `${normalizeName(card.setCode)} ${card.number.toLowerCase()}`, card)
  }
  indexCache.set(cardsById, index)
  return index
}

/** Among printings of one card, prefer the base one (id == "<game>:<sourceId>"), else the first. */
function preferBase(cards: Card[] | undefined): Card | undefined {
  if (!cards || cards.length === 0) return undefined
  return cards.find((c) => c.id === `${c.gameId}:${c.sourceId}`) ?? cards[0]
}

function resolveCard(text: string, index: CardIndex): Card | undefined {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return undefined

  // "Professor's Research SVI 189": set code + collector number at the end.
  if (tokens.length >= 3) {
    const key = `${normalizeName(tokens[tokens.length - 2])} ${tokens[tokens.length - 1].toLowerCase()}`
    const hit = preferBase(index.bySetNumber.get(key))
    if (hit) return hit
  }
  // "OP01-006 Name" / "unl-229*-219 Name": the card's own id first...
  const bySource = preferBase(index.bySource.get(tokens[0].toLowerCase()))
  if (bySource) return bySource
  // ...then the bare name, or the name after an id that isn't in this catalog.
  return preferBase(index.byName.get(normalizeName(text))) ?? preferBase(index.byName.get(normalizeName(tokens.slice(1).join(' '))))
}

function zoneForHeader(label: string, zones: DeckZoneRule[]): DeckZoneRule | null {
  const wanted = normalizeName(label)
  if (!wanted) return null
  return (
    zones.find((zone) => {
      const zoneLabel = normalizeName(zone.label)
      return wanted === zone.id || wanted === zoneLabel || wanted.includes(zoneLabel) || (wanted.length >= 4 && zoneLabel.includes(wanted))
    }) ?? null
  )
}

// "Main Deck (50/50):", "Pokémon: 12", "Total Cards: 60"
const HEADER_LINE = /^([\p{L}][\p{L}\s!]*?)\s*(?:\([^)]*\))?\s*:\s*(\d+)?$/u
// "Leader: OP01-001 Roronoa Zoro", "Legend: unl-229*-219 Vi ..." — a zone header with its single card inline.
const INLINE_ZONE_LINE = /^(legend|leader)\s*:\s*(\S.*)$/iu
// "4x OP01-006 Name", "4 Name SET 12", "4xOP01-006 Name". A bare "x" only counts as
// a multiplier directly after the digits or when set apart by spaces, so "4 Xerneas" stays a name.
const CARD_LINE = /^(\d+)(?:[xX×]\s*|\s+[xX×]\s+|\s+)(\S.*)$/u

/**
 * Parses a plain-text decklist — this app's own export, or the common
 * community formats for these games — into deck zones. Cards are matched by
 * their id/number first and by name second; anything that looks like a card
 * line but can't be matched is reported in `unmatched` instead of dropped
 * silently. Zone headers ("Sideboard (10/10):") steer cards into that zone
 * when they fit it; otherwise each card goes to the first zone that accepts it.
 */
export function parseDecklistText(text: string, adapter: GameAdapter, cardsById: Map<string, Card>): ParsedDeck {
  const index = indexFor(cardsById)
  const zoneRules = adapter.deckRules.zones
  const lines = text.split(/\r?\n/).map((line) => line.trim())

  const result: ParsedDeck = { name: null, formatLabel: null, zones: {}, freeTextZones: {}, unmatched: [], matchedCopies: 0 }

  // This app's export starts "<deck name>\n<game name> — <format>\nExported <date>".
  const firstIndex = lines.findIndex(Boolean)
  const secondIndex = firstIndex >= 0 ? lines.findIndex((line, i) => i > firstIndex && line !== '') : -1
  if (secondIndex >= 0 && lines[secondIndex].startsWith(adapter.name)) {
    result.name = lines[firstIndex]
    result.formatLabel = lines[secondIndex].split(' — ')[1]?.trim() || null
    lines[firstIndex] = ''
    lines[secondIndex] = ''
  }

  function addCard(zoneId: string, card: Card, quantity: number) {
    const entries = (result.zones[zoneId] ??= [])
    const existing = entries.find((e) => e.cardId === card.id)
    if (existing) existing.quantity += quantity
    else entries.push({ cardId: card.id, quantity })
    result.matchedCopies += quantity
  }

  function addFreeText(zoneId: string, label: string, quantity: number) {
    const entries = (result.freeTextZones[zoneId] ??= [])
    const existing = entries.find((e) => e.label === label)
    if (existing) existing.quantity += quantity
    else entries.push({ label, quantity })
    result.matchedCopies += quantity
  }

  function placeCard(card: Card, quantity: number, preferred: DeckZoneRule | null): boolean {
    const zone = preferred && !preferred.freeText && preferred.match(card) ? preferred : zoneRules.find((z) => !z.freeText && z.match(card))
    if (!zone) return false
    addCard(zone.id, card, quantity)
    return true
  }

  let currentZone: DeckZoneRule | null = null

  for (const line of lines) {
    if (!line || /^exported\b/i.test(line)) continue

    const inline = INLINE_ZONE_LINE.exec(line)
    if (inline) {
      const zone = zoneRules.find((z) => z.id === inline[1].toLowerCase()) ?? null
      const card = resolveCard(inline[2], index)
      if (zone && card && placeCard(card, 1, zone)) currentZone = zone
      else result.unmatched.push(line)
      continue
    }

    const cardLine = CARD_LINE.exec(line)
    if (cardLine) {
      const quantity = Number(cardLine[1])
      const rest = cardLine[2]

      if (currentZone?.freeText) {
        const option = currentZone.freeText.options.find((o) => normalizeName(o) === normalizeName(rest))
        if (option) {
          addFreeText(currentZone.id, option, quantity)
          continue
        }
      }

      const card = resolveCard(rest, index)
      if (card && placeCard(card, quantity, currentZone)) continue

      // Not a card — maybe a rune/resource line that arrived without its header.
      const freeZone = zoneRules.find((z) => z.freeText?.options.some((o) => normalizeName(o) === normalizeName(rest)))
      const option = freeZone?.freeText?.options.find((o) => normalizeName(o) === normalizeName(rest))
      if (freeZone && option) addFreeText(freeZone.id, option, quantity)
      else result.unmatched.push(line)
      continue
    }

    const header = HEADER_LINE.exec(line)
    if (header) currentZone = zoneForHeader(header[1], zoneRules)
  }

  return result
}
