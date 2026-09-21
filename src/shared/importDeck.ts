import type { Card, DeckCardEntry, DeckFreeTextEntry, DeckZoneRule } from './types'
import type { GameAdapter } from './games/types'
import { normalizeName } from './collection'
import { rulesForFormat } from './games/rules'
import { choosePrinting, type PrintingPrefs } from './printings'

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
    // "Delver of Secrets // Insectile Aberration": deck sites often list just the front face.
    const frontFace = card.name.split(' // ')[0]
    if (frontFace !== card.name) push(index.byName, normalizeName(frontFace), card)
    push(index.bySetNumber, `${normalizeName(card.setCode)} ${card.number.toLowerCase()}`, card)
  }
  indexCache.set(cardsById, index)
  return index
}

// What community lists append after a card name: a foil marker ("*F*"), a category tag
// ("[Ramp]", "^Have^"), a printing ("(C21) 263", "(PLST) C21-263"). Peeled off repeatedly, last one first.
const PRINTING_SUFFIXES = [/\s+\*[A-Za-z]+\*$/, /\s+\[[^\]]*\]$/, /\s+\^[^^]*\^$/, /\s+\([A-Za-z0-9]{2,6}\)(?:\s+\S+)?$/]

function stripPrintingSuffixes(text: string): string {
  let current = text.trim()
  for (let changed = true; changed; ) {
    changed = false
    for (const suffix of PRINTING_SUFFIXES) {
      const next = current.replace(suffix, '')
      if (next !== current && next) {
        current = next
        changed = true
      }
    }
  }
  return current
}

function resolveCard(text: string, index: CardIndex, stripSuffix = false, prefs: PrintingPrefs = {}): Card | undefined {
  const direct = resolveCardExact(text, index, prefs)
  if (direct || !stripSuffix) return direct
  // Only after the whole line failed to match, so a real name that ends in parentheses ("Boss's Orders (Cyrus)") is safe.
  const stripped = stripPrintingSuffixes(text)
  return stripped !== text ? resolveCardExact(stripped, index, prefs) : undefined
}

function resolveCardExact(text: string, index: CardIndex, prefs: PrintingPrefs): Card | undefined {
  const tokens = text.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return undefined

  // "Professor's Research SVI 189": set code + collector number at the end.
  if (tokens.length >= 3) {
    const key = `${normalizeName(tokens[tokens.length - 2])} ${tokens[tokens.length - 1].toLowerCase()}`
    const hit = choosePrinting(index.bySetNumber.get(key), prefs)
    if (hit) return hit
  }
  // "OP01-006 Name" / "unl-229*-219 Name": the card's own id first...
  const bySource = choosePrinting(index.bySource.get(tokens[0].toLowerCase()), prefs)
  if (bySource) return bySource
  // ...then the bare name, or the name after an id that isn't in this catalog.
  return (
    choosePrinting(index.byName.get(normalizeName(text)), prefs) ??
    choosePrinting(index.byName.get(normalizeName(tokens.slice(1).join(' '))), prefs)
  )
}

// Headings other sites use for the zones this app calls by other names.
const HEADER_ALIASES: Record<string, string> = {
  deck: 'main',
  maindeck: 'main',
  mainboard: 'main',
  main: 'main',
  sideboard: 'sideboard',
  side: 'sideboard',
  sidedeck: 'sideboard',
  companion: 'sideboard',
  extra: 'extra',
  extradeck: 'extra',
}

function zoneForHeader(label: string, zones: DeckZoneRule[]): DeckZoneRule | null {
  const wanted = normalizeName(label)
  if (!wanted) return null
  const aliased = HEADER_ALIASES[wanted.replace(/\s+/g, '')]
  const byAlias = aliased ? zones.find((zone) => zone.id === aliased) : undefined
  if (byAlias) return byAlias
  return (
    zones.find((zone) => {
      const zoneLabel = normalizeName(zone.label)
      return wanted === zone.id || wanted === zoneLabel || wanted.includes(zoneLabel) || (wanted.length >= 4 && zoneLabel.includes(wanted))
    }) ?? null
  )
}

// "Main Deck (50/50):", "Pokémon: 12", "Total Cards: 60"
const HEADER_LINE = /^([\p{L}][\p{L}\s!]*?)\s*(?:\([^)]*\))?\s*:\s*(\d+)?$/u
// "#main", "#extra", "!side": the headings of a .ydk file.
const YDK_HEADING = /^[#!](main|extra|side)$/i
// "Deck", "Sideboard", "Commander": a heading with no colon or count (Arena, MTGO, Moxfield).
const BARE_HEADER_LINE = /^([\p{L}][\p{L} ]{0,24})$/u
// "SB: 2 Negate": one sideboard card, tagged on its own line (MTGO, Moxfield).
const SIDEBOARD_PREFIX = /^SB:\s*(\S.*)$/i
// "Leader: OP01-001 Roronoa Zoro", "Legend: unl-229*-219 Vi ..." — a zone header with its single card inline.
const INLINE_ZONE_LINE = /^(legend|leader)\s*:\s*(\S.*)$/iu
// "4x OP01-006 Name", "4 Name SET 12", "4xOP01-006 Name". A bare "x" only counts as
// a multiplier directly after the digits or when set apart by spaces, so "4 Xerneas" stays a name.
const CARD_LINE = /^(\d+)(?:[xX×]\s*|\s+[xX×]\s+|\s+)(\S.*)$/u

/**
 * A format whose deck has a zone the default one lacks, when the text has a heading for it: an Arena
 * export with a "Commander" heading is a Commander deck. null when nothing points to one.
 */
export function detectFormatFromHeadings(text: string, adapter: GameAdapter): string | null {
  const headings = new Set(
    text
      .split(/\r?\n/)
      .map((line) => normalizeName(line.replace(/[:\s\d()/]+$/u, '')))
      .filter(Boolean),
  )
  const defaultZoneIds = new Set(adapter.deckRules.zones.map((z) => z.id))
  for (const [formatId, rules] of Object.entries(adapter.deckRulesByFormat ?? {})) {
    if (rules.zones.some((z) => !defaultZoneIds.has(z.id) && headings.has(normalizeName(z.label)))) return formatId
  }
  return null
}

/**
 * Parses a plain-text decklist — this app's own export, or the common
 * community formats for these games — into deck zones. Cards are matched by
 * their id/number first and by name second; anything that looks like a card
 * line but can't be matched is reported in `unmatched` instead of dropped
 * silently. Zone headers ("Sideboard (10/10):") steer cards into that zone
 * when they fit it; otherwise each card goes to the first zone that accepts it
 * (never a `manualOnly` one, like a sideboard or Commander, which need a heading).
 * `formatId` picks the zones to parse into for games whose deck shape depends on it. `prefs` steers which
 * printing a name-only line gets when a card has several (see choosePrinting): a printing you own, a legal
 * one, a regular one over alternate art, the lowest rarity.
 */
export function parseDecklistText(text: string, adapter: GameAdapter, cardsById: Map<string, Card>, formatId?: string, prefs: PrintingPrefs = {}): ParsedDeck {
  const index = indexFor(cardsById)
  const zoneRules = rulesForFormat(adapter, formatId).zones
  const stripSuffix = adapter.importOptions?.stripPrintingSuffix ?? false
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
    const zone = preferred && !preferred.freeText && preferred.match(card) ? preferred : zoneRules.find((z) => !z.freeText && !z.manualOnly && z.match(card))
    if (!zone) return false
    addCard(zone.id, card, quantity)
    return true
  }

  let currentZone: DeckZoneRule | null = null

  // MTGO-style lists mark no sideboard at all: the blank line after the main deck starts it. Only
  // trusted when the list has no headings or "SB:" tags of its own, which are then the better signal.
  const headerZoneOf = (line: string): DeckZoneRule | null => {
    const header = HEADER_LINE.exec(line) ?? BARE_HEADER_LINE.exec(line)
    return header ? zoneForHeader(header[1], zoneRules) : null
  }
  const hasZoneHeaders = lines.some((line) => SIDEBOARD_PREFIX.test(line) || headerZoneOf(line) !== null)
  const sideboardZone = zoneRules.find((z) => z.id === 'sideboard' && !z.freeText) ?? null
  const blankLineStartsSideboard = (adapter.importOptions?.blankLineStartsSideboard ?? false) && !hasZoneHeaders && sideboardZone !== null
  let cardsInBlock = 0
  const isYdk = lines.some((line) => /^#main$/i.test(line))

  for (const rawLine of lines) {
    if (!rawLine && blankLineStartsSideboard && cardsInBlock > 0) {
      currentZone = sideboardZone
      cardsInBlock = 0
    }
    if (!rawLine || /^exported\b/i.test(rawLine)) continue

    const sideboardTag = SIDEBOARD_PREFIX.exec(rawLine)
    const line = sideboardTag ? sideboardTag[1] : rawLine
    const tagZone = sideboardTag ? sideboardZone : null

    // .ydk files (Yu-Gi-Oh!): "#main" / "#extra" / "!side" headings, then one card passcode per line, one copy each.
    if (isYdk) {
      const ydkHeading = YDK_HEADING.exec(line)
      if (ydkHeading) {
        currentZone = zoneForHeader(ydkHeading[1], zoneRules)
        continue
      }
      if (/^\d{3,10}$/.test(line)) {
        const card = choosePrinting(index.bySource.get(line), prefs)
        if (card && placeCard(card, 1, currentZone)) continue
        result.unmatched.push(rawLine)
        continue
      }
    }

    const inline = INLINE_ZONE_LINE.exec(line)
    if (inline) {
      const zone = zoneRules.find((z) => z.id === inline[1].toLowerCase()) ?? null
      const card = resolveCard(inline[2], index, false, prefs)
      if (zone && card && placeCard(card, 1, zone)) currentZone = zone
      else result.unmatched.push(rawLine)
      continue
    }

    const cardLine = CARD_LINE.exec(line)
    if (cardLine) {
      const quantity = Number(cardLine[1])
      const rest = cardLine[2]

      if (!tagZone && currentZone?.freeText) {
        const option = currentZone.freeText.options.find((o) => normalizeName(o) === normalizeName(rest))
        if (option) {
          addFreeText(currentZone.id, option, quantity)
          continue
        }
      }

      const card = resolveCard(rest, index, stripSuffix, prefs)
      if (card && placeCard(card, quantity, tagZone ?? currentZone)) {
        cardsInBlock += 1
        continue
      }

      // Not a card — maybe a rune/resource line that arrived without its header.
      const freeZone = zoneRules.find((z) => z.freeText?.options.some((o) => normalizeName(o) === normalizeName(rest)))
      const option = freeZone?.freeText?.options.find((o) => normalizeName(o) === normalizeName(rest))
      if (freeZone && option) addFreeText(freeZone.id, option, quantity)
      else result.unmatched.push(rawLine)
      continue
    }

    const header = HEADER_LINE.exec(line)
    if (header) {
      currentZone = zoneForHeader(header[1], zoneRules)
      continue
    }
    // A bare heading ("Sideboard") only ever switches zones; other loose text is ignored rather than ending the current zone.
    const bare = BARE_HEADER_LINE.exec(line)
    const bareZone = bare ? zoneForHeader(bare[1], zoneRules) : null
    if (bareZone) currentZone = bareZone
  }

  return result
}
