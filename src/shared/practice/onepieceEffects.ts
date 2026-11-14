import type { Card } from '../types'

/**
 * The One Piece card text a practice game (onepiece.ts) can run by itself: a small set of plain,
 * common effects, read from the text after a timing tag ([On Play], [Main], [Counter], [Trigger],
 * [When Attacking], [On K.O.]). The sentences it understands run, from the start of the section up to
 * the first one it doesn't (a condition or a cost: "If...", "You may...", "DON!! −1:"); that one and
 * the rest are logged with their text for you to do with the tools.
 */

export type Timing = 'onPlay' | 'main' | 'counter' | 'trigger' | 'whenAttacking' | 'onKO'

export type Effect =
  | { kind: 'draw'; n: number }
  /** K.O. up to 1 of the opponent's Characters (cost or power at most). */
  | { kind: 'ko'; maxCost?: number; maxPower?: number }
  | { kind: 'rest'; maxCost?: number }
  /** −power to the opponent's Leader or a Character this turn. */
  | { kind: 'weaken'; n: number; leader: boolean }
  /** Return a Character (anyone's, the opponent's chosen) to its owner's hand / bottom of their deck. */
  | { kind: 'bounce'; maxCost?: number; where: 'hand' | 'bottom' }
  /** +power to your own Leader or a Character, for this battle or this turn. */
  | { kind: 'buff'; n: number; leader: boolean; onlyLeader?: boolean; battle: boolean }
  | { kind: 'addDon'; n: number; active: boolean }
  /** [Trigger] Play this card. */
  | { kind: 'playSelf' }

export interface Section {
  timing: Timing
  text: string
  /** The effects the game runs: the sentences it understands, from the start. */
  effects: Effect[]
  /** What's left for you to do (a sentence it doesn't understand and all after it), or null when it runs all of it. */
  leftover: string | null
}

const TAGS: [RegExp, Timing][] = [
  [/^On Play$/i, 'onPlay'],
  [/^Main$/i, 'main'],
  [/^Counter$/i, 'counter'],
  [/^Trigger$/i, 'trigger'],
  [/^When Attacking$/i, 'whenAttacking'],
  [/^On K\.O\.$/i, 'onKO'],
]

const num = (s: string) => Number(s.replace(/,/g, ''))

function readSentence(raw: string): Effect | null {
  const s = raw.trim().replace(/\.$/, '')
  let m: RegExpExecArray | null
  if ((m = /^Draw (\d+) cards?$/i.exec(s))) return { kind: 'draw', n: num(m[1]) }
  if ((m = /^K\.O\. up to 1 of your opponent's Characters with a cost of (\d+) or less$/i.exec(s))) return { kind: 'ko', maxCost: num(m[1]) }
  if ((m = /^K\.O\. up to 1 of your opponent's Characters with ([\d,]+) power or less$/i.exec(s))) return { kind: 'ko', maxPower: num(m[1]) }
  if ((m = /^Rest up to 1 of your opponent's Characters(?: with a cost of (\d+) or less)?$/i.exec(s))) return { kind: 'rest', maxCost: m[1] ? num(m[1]) : undefined }
  if ((m = /^Give up to 1 of your opponent's (Leader or )?Character(?:s| cards) −?-?([\d,]+) power during this turn$/i.exec(s))) return { kind: 'weaken', n: num(m[2]), leader: !!m[1] }
  if ((m = /^Return up to 1 (?:of your opponent's )?Characters? with a cost of (\d+) or less to the owner's hand$/i.exec(s))) return { kind: 'bounce', maxCost: num(m[1]), where: 'hand' }
  if ((m = /^Place up to 1 (?:of your opponent's )?Characters? with a cost of (\d+) or less at the bottom of the owner's deck$/i.exec(s))) return { kind: 'bounce', maxCost: num(m[1]), where: 'bottom' }
  if ((m = /^(?:Up to 1 of y|Y)our (Leader or Character cards|Leader|Characters?) gains? \+([\d,]+) power during this (battle|turn)$/i.exec(s))) {
    const battle = m[3].toLowerCase() === 'battle'
    // "Your Leader" alone: only the Leader (a Character in the battle doesn't get it).
    return { kind: 'buff', n: num(m[2]), leader: /Leader/i.test(m[1]), onlyLeader: !/Character/i.test(m[1]), battle }
  }
  if ((m = /^Add up to (\d+) DON!! cards? from your DON!! deck and (?:set it|set them|rest it|rest them) as (active|rested)$/i.exec(s))) return { kind: 'addDon', n: num(m[1]), active: m[2].toLowerCase() === 'active' }
  if (/^Play this card$/i.test(s)) return { kind: 'playSelf' }
  return null
}

/** The card's text as sections by timing (keywords and the Power/Counter/Life lines aside). */
export function sectionsOf(card: Card): Section[] {
  const text = (card.text ?? '')
    .split('\n')
    .filter((l) => !/^(Power|Counter|Life|Attribute):/i.test(l))
    .join(' ')
    .replace(/\s*This card has been officially errata'?d\.?/gi, '')
    // Reminder text in brackets.
    .replace(/\([^)]*\)/g, '')
  const out: Section[] = []
  const re = /\[([^\]]+)\]/g
  const marks: { tag: string; at: number; end: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) marks.push({ tag: m[1], at: m.index, end: re.lastIndex })
  for (let i = 0; i < marks.length; i++) {
    const timing = TAGS.find(([r]) => r.test(marks[i].tag))?.[1]
    if (!timing) continue
    // Text up to the next timing tag (other tags, like [Once Per Turn], stay in and stop it running).
    let j = i + 1
    while (j < marks.length && !TAGS.some(([r]) => r.test(marks[j].tag))) j++
    const body = text.slice(marks[i].end, j < marks.length ? marks[j].at : undefined).trim()
    const sentences = body
      .split(/(?<=\.)(?<!K\.O\.)\s+/)
      .map((x) => x.replace(/^Then,\s*/i, '').trim())
      .filter(Boolean)
    // A sentence with another tag in it ([Once Per Turn], a card name) isn't one it reads.
    const read = sentences.map((x) => (/\[/.test(x) ? null : readSentence(x)))
    const known = read.findIndex((e) => e == null)
    const effects = (known < 0 ? read : read.slice(0, known)) as Effect[]
    const leftover = known < 0 && read.length > 0 ? null : sentences.slice(effects.length).join(' ') || body
    out.push({ timing, text: body, effects, leftover })
  }
  return out
}

export function sectionFor(card: Card, timing: Timing): Section | undefined {
  return sectionsOf(card).find((s) => s.timing === timing)
}

/** Whether the game runs all of a card's text (keywords and plain stats count as run). */
export function fullyRun(card: Card): boolean {
  return sectionsOf(card).every((s) => s.leftover == null)
}

/** "K.O. a 3-cost or less", for the log. */
export function describeEffect(e: Effect): string {
  switch (e.kind) {
    case 'draw':
      return `draw ${e.n}`
    case 'ko':
      return e.maxCost != null ? `K.O. a Character costing ${e.maxCost} or less` : `K.O. a Character with ${e.maxPower} power or less`
    case 'rest':
      return e.maxCost != null ? `rest a Character costing ${e.maxCost} or less` : 'rest a Character'
    case 'weaken':
      return `−${e.n} power this turn`
    case 'bounce':
      return e.where === 'hand' ? `return a Character costing ${e.maxCost} or less to hand` : `put a Character costing ${e.maxCost} or less on the bottom of the deck`
    case 'buff':
      return `+${e.n} power this ${e.battle ? 'battle' : 'turn'}`
    case 'addDon':
      return `add ${e.n} DON!!`
    case 'playSelf':
      return 'play it'
  }
}
