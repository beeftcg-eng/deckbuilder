import type { Card, GameId } from './types'
import { normalizeName } from './collection'
import { choosePrinting, type PrintingPrefs } from './printings'

/**
 * Collection import from other apps' CSV exports (TCGplayer, Moxfield, Dragon Shield, ManaBox, and
 * anything else with a name and a quantity column). Each row is matched to one printing, most
 * trustworthy clue first: a Scryfall id, a TCGplayer product id, the set and collector number (only
 * when the name agrees, since apps don't all spell set codes the same way), and last the name alone.
 */

export type CsvSource = 'TCGplayer' | 'Moxfield' | 'Dragon Shield' | 'ManaBox'

export interface CollectionImportItem {
  card: Card
  quantity: number
}

export interface CollectionImport {
  /** The app the file looks like it came from, when its columns give it away. */
  source: CsvSource | null
  /** Whether a header row with at least a card name column was found. */
  recognised: boolean
  /** One entry per printing, rows for the same printing added together. */
  items: CollectionImportItem[]
  copies: number
  /** Copies whose row named a set or number that didn't match, so they were matched by name only. */
  byNameCopies: number
  /** Rows the file says are for another game. */
  otherGameRows: number
  /** Rows that matched no card, as "3 Name (SET 12)". */
  unmatched: string[]
}

// ---------- CSV ----------

/** RFC 4180 rows: quoted fields, doubled quotes, CRLF, a BOM, and `,`, `;` or tab as the separator. */
export function parseCsv(text: string): string[][] {
  let body = text.replace(/^﻿/, '')
  let sep = ''
  const sepLine = /^"?sep=(.)"?\r?\n/i.exec(body) // Dragon Shield's Excel hint
  if (sepLine) {
    sep = sepLine[1]
    body = body.slice(sepLine[0].length)
  }
  if (!sep) {
    const firstLine = body.slice(0, body.search(/\r?\n|$/))
    const counts = [',', ';', '\t'].map((s) => [s, firstLine.split(s).length] as const)
    sep = counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0]
  }
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++
      row.push(field)
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

// ---------- columns ----------

type Column = 'quantity' | 'name' | 'setCode' | 'setName' | 'set' | 'number' | 'scryfall' | 'tcgplayer' | 'game' | 'rarity'

/** Header spellings per column, most specific first (TCGplayer's "Simple Name" beats its "Name", which carries printing tags). */
const COLUMN_NAMES: Record<Column, string[]> = {
  quantity: ['quantity', 'count', 'qty', 'totalquantity', 'amount', 'copies', 'havequantity'],
  name: ['simplename', 'cardname', 'name', 'card', 'productname'],
  setCode: ['setcode', 'edition', 'editioncode', 'setid', 'expansioncode'],
  setName: ['setname', 'editionname', 'expansion', 'expansionname'],
  set: ['set'],
  number: ['collectornumber', 'cardnumber', 'number', 'collectorsnumber', 'card', 'no'],
  scryfall: ['scryfallid'],
  tcgplayer: ['productid', 'tcgplayerid', 'tcgplayerproductid'],
  game: ['productline', 'game', 'tcg'],
  rarity: ['rarity'],
}

function headerKey(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findColumns(header: string[]): Partial<Record<Column, number>> {
  const keys = header.map(headerKey)
  const found: Partial<Record<Column, number>> = {}
  const taken = new Set<number>()
  // Name before number, so a lone "Card" column is the name rather than a card number.
  for (const column of ['quantity', 'name', 'setCode', 'setName', 'set', 'number', 'scryfall', 'tcgplayer', 'game', 'rarity'] as Column[]) {
    for (const alias of COLUMN_NAMES[column]) {
      const index = keys.findIndex((k, i) => k === alias && !taken.has(i))
      if (index >= 0) {
        found[column] = index
        taken.add(index)
        break
      }
    }
  }
  return found
}

function detectSource(header: string[]): CsvSource | null {
  const keys = new Set(header.map(headerKey))
  if (keys.has('manaboxid')) return 'ManaBox'
  if (keys.has('tradelistcount')) return 'Moxfield'
  if (keys.has('foldername') || keys.has('tradequantity')) return 'Dragon Shield'
  if (keys.has('productline') || keys.has('simplename') || keys.has('sku') || keys.has('tcgplayerid')) return 'TCGplayer'
  return null
}

const GAME_PATTERNS: [RegExp, GameId][] = [
  [/magic/i, 'mtg'],
  [/pok[eé]mon/i, 'pokemon'],
  [/yu-?gi-?oh/i, 'yugioh'],
  [/one ?piece/i, 'onepiece'],
  [/riftbound|league of legends/i, 'riftbound'],
]

function gameOf(value: string): GameId | null {
  return GAME_PATTERNS.find(([re]) => re.test(value))?.[1] ?? null
}

// ---------- matching ----------

/** "SWSH07: Evolving Skies" (TCGplayer) → "evolving skies". */
function setNameKey(value: string): string {
  return normalizeName(value.replace(/^[A-Za-z0-9]{2,8}:\s*/, ''))
}

function code(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** "077", "77/198" and "077a" → "77", "77", "77a"; "TG05" and "EN045" keep their letters. */
function collectorNumber(value: string): string {
  const main = value.split('/')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return main.replace(/^0+(?=\d)/, '')
}

/** A row's name without the printing notes apps add: "Umbreon VMAX (Alternate Art Secret)", "Pikachu - 025/165". */
function baseName(value: string): string {
  let name = value.trim()
  for (let prev = ''; prev !== name; ) {
    prev = name
    name = name.replace(/\s*[([][^)\]]*[)\]]\s*$/, '').replace(/\s+-\s+[A-Za-z]*\d[\w/-]*$/, '').trim()
  }
  return name || value.trim()
}

interface Index {
  byId: Map<string, Card[]>
  byTcgplayer: Map<string, Card[]>
  bySetNumber: Map<string, Card[]>
  byFullNumber: Map<string, Card[]>
  bySetNameNumber: Map<string, Card[]>
  byName: Map<string, Card[]>
}

const indexCache = new WeakMap<readonly Card[], Index>()

function push(map: Map<string, Card[]>, key: string, card: Card): void {
  const list = map.get(key)
  if (list) {
    if (!list.includes(card)) list.push(card)
  } else map.set(key, [card])
}

function nameKeys(name: string): string[] {
  const keys = [normalizeName(name), normalizeName(baseName(name))]
  const front = name.split(' // ')[0]
  if (front !== name) keys.push(normalizeName(front))
  // Riftbound's data writes "Ahri - Alluring" where other apps write "Ahri, Alluring".
  for (const k of [...keys]) if (k.includes(' - ')) keys.push(k.replace(' - ', ', '))
  return [...new Set(keys)]
}

function indexFor(cards: readonly Card[]): Index {
  const cached = indexCache.get(cards)
  if (cached) return cached
  const index: Index = { byId: new Map(), byTcgplayer: new Map(), bySetNumber: new Map(), byFullNumber: new Map(), bySetNameNumber: new Map(), byName: new Map() }
  for (const card of cards) {
    push(index.byId, card.sourceId.toLowerCase(), card)
    push(index.byId, card.id.slice(card.id.indexOf(':') + 1).toLowerCase(), card)
    if (card.tcgplayerId) push(index.byTcgplayer, card.tcgplayerId, card)
    const number = collectorNumber(card.number)
    if (number) {
      for (const set of new Set([code(card.setCode), code(card.setId)])) {
        if (set) push(index.bySetNumber, `${set}|${number}`, card)
      }
      push(index.bySetNameNumber, `${setNameKey(card.setName)}|${number}`, card)
      // Yu-Gi-Oh! prints "LOB-EN001" and One Piece "OP01-077" as one code.
      push(index.byFullNumber, code(`${card.setCode}${card.number}`), card)
    }
    push(index.byFullNumber, code(card.sourceId), card)
    for (const key of nameKeys(card.name)) push(index.byName, key, card)
  }
  indexCache.set(cards, index)
  return index
}

/** Whether a row's name and a card's name are the same card, allowing for printing notes on either side. */
function sameName(rowName: string, card: Card): boolean {
  if (!rowName) return true
  const cardKeys = nameKeys(card.name)
  return nameKeys(rowName).some((k) => cardKeys.some((c) => c === k || c.startsWith(`${k} `) || k.startsWith(`${c} `) || c.startsWith(`${k},`)))
}

interface Row {
  name: string
  setCode: string
  setName: string
  number: string
  scryfall: string
  tcgplayer: string
  rarity: string
}

function narrow(cards: Card[] | undefined, row: Row, prefs: PrintingPrefs): Card | undefined {
  if (!cards) return undefined
  let matching = cards.filter((c) => sameName(row.name, c))
  if (row.rarity) {
    const byRarity = matching.filter((c) => (c.rarity ?? '').toLowerCase() === row.rarity.toLowerCase())
    if (byRarity.length > 0) matching = byRarity
  }
  return choosePrinting(matching, prefs)
}

function matchRow(row: Row, index: Index, prefs: PrintingPrefs): { card: Card; byName: boolean } | undefined {
  const exact = (cards: Card[] | undefined) => narrow(cards, row, prefs)
  const number = collectorNumber(row.number)
  const hit =
    (row.scryfall && exact(index.byId.get(row.scryfall.toLowerCase()))) ||
    (row.tcgplayer && exact(index.byTcgplayer.get(row.tcgplayer.trim()))) ||
    (row.setCode && number && exact(index.bySetNumber.get(`${code(row.setCode)}|${number}`))) ||
    (row.setName && number && exact(index.bySetNameNumber.get(`${setNameKey(row.setName)}|${number}`))) ||
    (row.number && exact(index.byFullNumber.get(code(row.number)))) ||
    (row.number && exact(index.byFullNumber.get(code(`${row.setCode}${row.number}`)))) ||
    undefined
  if (hit) return { card: hit, byName: false }
  if (!row.name) return undefined

  // By name: a printing from the row's set when there is one, else the plainest printing.
  let named: Card[] = []
  for (const key of nameKeys(row.name)) {
    named = index.byName.get(key) ?? []
    if (named.length > 0) break
  }
  if (named.length === 0) return undefined
  const setKeys = [code(row.setCode), setNameKey(row.setName)].filter(Boolean)
  const inSet = named.filter((c) => setKeys.includes(code(c.setCode)) || setKeys.includes(code(c.setId)) || setKeys.includes(setNameKey(c.setName)))
  const pool = inSet.length > 0 ? inSet : named
  const sameNumber = number ? pool.filter((c) => collectorNumber(c.number) === number) : []
  const card = choosePrinting(sameNumber.length > 0 ? sameNumber : pool, prefs)
  if (!card) return undefined
  // Only a guess at the printing when the row named a set or number that didn't pin it down.
  const gaveSet = Boolean(row.setCode || row.setName || row.number)
  const pinned = inSet.length > 0 && (!number || sameNumber.length > 0)
  return { card, byName: gaveSet && !pinned }
}

function describe(row: Row, quantity: number): string {
  const where = [row.setCode || row.setName, row.number].filter(Boolean).join(' ')
  return `${quantity} ${row.name || row.scryfall || row.tcgplayer || '?'}${where ? ` (${where})` : ''}`
}

/** Reads a collection CSV for `gameId`, matching its rows against that game's `cards`. */
export function importCollectionCsv(text: string, gameId: GameId, cards: readonly Card[], prefs: PrintingPrefs = {}): CollectionImport {
  const result: CollectionImport = { source: null, recognised: false, items: [], copies: 0, byNameCopies: 0, otherGameRows: 0, unmatched: [] }
  const rows = parseCsv(text)
  // Some exports put a title or a blank line above the header, so the header is the first row with a name column.
  const headerAt = rows.slice(0, 5).findIndex((r) => findColumns(r).name !== undefined)
  if (headerAt < 0) return result
  const header = rows[headerAt]
  const columns = findColumns(header)
  result.recognised = true
  result.source = detectSource(header)

  const index = indexFor(cards)
  const byCard = new Map<string, CollectionImportItem>()
  const cell = (r: string[], column: Column) => (columns[column] !== undefined ? (r[columns[column]!] ?? '').trim() : '')

  for (const r of rows.slice(headerAt + 1)) {
    const rawQuantity = cell(r, 'quantity')
    const quantity = columns.quantity === undefined ? 1 : Number.parseInt(rawQuantity.replace(/[^\d-]/g, ''), 10)
    if (!Number.isFinite(quantity) || quantity <= 0) continue
    const game = cell(r, 'game')
    const rowGame = game ? gameOf(game) : null
    if (rowGame && rowGame !== gameId) {
      result.otherGameRows += 1
      continue
    }
    // A bare "Set" column is a set name in TCGplayer's export and a set code in others; it's tried as both.
    const set = cell(r, 'set')
    const row: Row = {
      name: cell(r, 'name'),
      setCode: cell(r, 'setCode') || (set.length <= 6 ? set : ''),
      setName: cell(r, 'setName') || (set.length > 6 || !cell(r, 'setCode') ? set : ''),
      number: cell(r, 'number'),
      scryfall: cell(r, 'scryfall'),
      tcgplayer: cell(r, 'tcgplayer'),
      rarity: cell(r, 'rarity'),
    }
    if (!row.name && !row.scryfall && !row.tcgplayer) continue
    const match = matchRow(row, index, prefs)
    if (!match) {
      result.unmatched.push(describe(row, quantity))
      continue
    }
    const existing = byCard.get(match.card.id)
    if (existing) existing.quantity += quantity
    else byCard.set(match.card.id, { card: match.card, quantity })
    result.copies += quantity
    if (match.byName) result.byNameCopies += quantity
  }
  result.items = [...byCard.values()]
  return result
}

// ---------- export ----------

function csvField(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * A collection as CSV, in columns this importer and the usual apps read back: Quantity, Name, Set
 * Code, Set Name, Collector Number, Rarity, plus the game, the price and your for-trade mark, and
 * Magic's Scryfall id so a re-import lands on the exact printing.
 */
export function collectionCsv(entries: readonly { card: Card; copies: number; forTrade: boolean }[], gameName: string): string {
  const header = ['Quantity', 'Name', 'Set Code', 'Set Name', 'Collector Number', 'Rarity', 'Game', 'Price (USD)', 'For Trade', 'Scryfall ID']
  const rows = [...entries]
    .sort((a, b) => a.card.setName.localeCompare(b.card.setName) || a.card.number.localeCompare(b.card.number, undefined, { numeric: true }))
    .map(({ card, copies, forTrade }) => [
      copies,
      card.name,
      card.setCode,
      card.setName,
      card.number,
      card.rarity ?? '',
      gameName,
      card.price != null ? card.price.toFixed(2) : '',
      forTrade ? 'yes' : '',
      card.gameId === 'mtg' ? card.id.slice(card.id.indexOf(':') + 1) : '',
    ])
  return [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}
