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

// Riftbound's own card data (riftcodex) isn't consistent about how a Legend/Champion's title is
// separated from its base name - some cards are "Name - Title" ("Pyke - Returned"), others are
// "Name, Title" ("Irelia, Fervent") - and Rift Atlas's export always writes the comma form, which
// then fails to match a card only listed under the dash form. Tried both ways since a real card
// name legitimately containing a comma or a dash is exceedingly unlikely to also happen to match
// a different real card once swapped, so this only ever helps, never mismatches.
function swapNameSeparator(text: string): string | null {
  if (text.includes(' - ')) return text.replace(' - ', ', ')
  if (text.includes(', ')) return text.replace(', ', ' - ')
  return null
}

function resolveCard(text: string, index: CardIndex, stripSuffix = false, prefs: PrintingPrefs = {}): Card | undefined {
  const direct = resolveCardExact(text, index, prefs)
  if (direct) return direct
  const swapped = swapNameSeparator(text)
  const bySwap = swapped ? resolveCardExact(swapped, index, prefs) : undefined
  if (bySwap || !stripSuffix) return bySwap
  // Only after the whole line failed to match, so a real name that ends in parentheses ("Boss's Orders (Cyrus)") is safe.
  const stripped = stripPrintingSuffixes(text)
  return stripped !== text ? resolveCardExact(stripped, index, prefs) : undefined
}

// A free-text pick's name sometimes also exists as a real catalog card in its own right (Riftbound's
// "Calm Rune" is both a Rune Deck pick and a literal card named "Calm Rune"), so a line under a
// freeText zone's heading needs to recognize "<option> <word...>" ("Calm Rune"), not just the bare
// option ("Calm") - otherwise it falls through to card-name matching, finds the real card, and the
// pick lands in whichever zone that card normally belongs in instead of the freeText zone. Still a
// whole-word match ("Calmness" doesn't count), and still exact-match first.
function matchFreeTextOption(options: readonly string[], rest: string): string | undefined {
  const wanted = normalizeName(rest)
  return options.find((o) => {
    const n = normalizeName(o)
    return wanted === n || wanted.startsWith(`${n} `)
  })
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
  // Several Riftbound sites (Piltover Archive, Riftbound Zone, Magical Meta) break Champions out
  // under their own heading even though there's no separate Champion zone in this app's data
  // model - a Champion card is just a Unit that lives in the Main Deck like any other. Explicit
  // here rather than relying on the same card-category fallback that placed it there anyway (see
  // placeCard), since that's implicit and this makes the intent traceable.
  champion: 'main',
  sideboard: 'sideboard',
  side: 'sideboard',
  sidedeck: 'sideboard',
  companion: 'sideboard',
  extra: 'extra',
  extradeck: 'extra',
}

// "Maybeboard" (Moxfield's own board type, and Deckstats.net's explicit "Maybeboard:" section,
// which its own import deliberately leaves out of the real deck) - cards someone is considering,
// not part of the deck. Recognized so its cards are skipped outright rather than falling through
// to the generic zone-fallback and silently landing in Main Deck as if they'd been playing them.
function isMaybeboardHeading(label: string): boolean {
  const wanted = normalizeName(label).replace(/\s+/g, '')
  return wanted === 'maybeboard' || wanted === 'maybe'
}

function classifyHeader(label: string, zones: DeckZoneRule[]): { zone: DeckZoneRule | null; maybeboard: boolean } {
  if (isMaybeboardHeading(label)) return { zone: null, maybeboard: true }
  return { zone: zoneForHeader(label, zones), maybeboard: false }
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

// "Main Deck (50/50):", "Pokémon: 12", "Total Cards: 60", "//Mainboard" (Deckstats.net's own prefix).
const HEADER_LINE = /^(?:\/\/\s*)?([\p{L}][\p{L}\s!]*?)\s*(?:\([^)]*\))?\s*:\s*(\d+)?$/u
// "#main", "#extra", "!side": the headings of a .ydk file.
const YDK_HEADING = /^[#!](main|extra|side)$/i
// "Deck", "Sideboard", "Commander", "//Sideboard": a heading with no colon or count (Arena, MTGO, Moxfield, Deckstats.net).
const BARE_HEADER_LINE = /^(?:\/\/\s*)?([\p{L}][\p{L} ]{0,24})$/u
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
  // Set by a "Maybeboard" heading, cleared by any other recognized heading - see isMaybeboardHeading.
  let ignoringSection = false

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
      if (ignoringSection) continue // a Maybeboard card - intentionally not part of the deck

      const quantity = Number(cardLine[1])
      const rest = cardLine[2]

      // Checked before card-name resolution, and across every freeText zone regardless of the
      // current heading - some sites (RiftMana's "Card Names" export) have no section headers at
      // all, so a rune pick can never rely on being "under" a Runes heading. Safe to prioritize
      // over a real card of the same name (Riftbound's own catalog has both a "Calm Rune" pick
      // and a literal "Calm Rune" card): the option vocabulary is a small, fixed set of domain
      // names with no real non-Rune card sharing one, checked once against the live card data.
      if (!tagZone) {
        const freeZone = zoneRules.find((z) => z.freeText && matchFreeTextOption(z.freeText.options, rest))
        const option = freeZone?.freeText ? matchFreeTextOption(freeZone.freeText.options, rest) : undefined
        if (freeZone && option) {
          addFreeText(freeZone.id, option, quantity)
          continue
        }
      }

      const card = resolveCard(rest, index, stripSuffix, prefs)
      if (card && placeCard(card, quantity, tagZone ?? currentZone)) {
        cardsInBlock += 1
        continue
      }

      result.unmatched.push(rawLine)
      continue
    }

    const header = HEADER_LINE.exec(line)
    if (header) {
      const classified = classifyHeader(header[1], zoneRules)
      currentZone = classified.zone
      ignoringSection = classified.maybeboard
      continue
    }
    // A bare heading ("Sideboard") only ever switches zones; other loose text is ignored rather than ending the current zone.
    const bare = BARE_HEADER_LINE.exec(line)
    const bareClassified = bare ? classifyHeader(bare[1], zoneRules) : null
    if (bareClassified && (bareClassified.zone || bareClassified.maybeboard)) {
      currentZone = bareClassified.zone
      ignoringSection = bareClassified.maybeboard
    }
  }

  return result
}
