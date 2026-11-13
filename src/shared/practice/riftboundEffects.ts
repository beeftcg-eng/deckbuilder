import type { Card } from '../types'

/**
 * Reading Riftbound card text into effects the practice game can run (riftbound.ts resolves them).
 * Only the common, regular wordings: dealing damage, Might this turn, drawing, stunning, killing,
 * readying and exhausting, returning to hand, unit tokens, channelling, buffing, discarding, and the
 * triggers "When you play me", "When I attack / defend / conquer / hold" and Deathknell. A card counts
 * as understood (`full`) only when every sentence of its text was read; otherwise the parts that were
 * read are kept, but the game leaves the card to you, as before.
 */

export type Who = 'enemy' | 'friendly' | 'any'

export interface Target {
  who: Who
  /** Only units at a battlefield ("at a battlefield"), or at the source's battlefield ("here"). */
  where: 'anywhere' | 'battlefield' | 'here'
  /** Every unit that fits, instead of one chosen. */
  all: boolean
  /** The card itself ("me"). */
  self: boolean
  /** "with 3 :rb_might: or less" */
  maxMight?: number
}

export type Effect =
  | { kind: 'damage'; amount: number; target: Target }
  /** Might this turn; negative amounts stop at `floor`. */
  | { kind: 'might'; amount: number; target: Target; floor?: number }
  | { kind: 'stun'; target: Target }
  | { kind: 'kill'; target: Target }
  | { kind: 'ready'; target: Target }
  | { kind: 'exhaust'; target: Target }
  | { kind: 'toHand'; target: Target }
  | { kind: 'buff'; target: Target }
  | { kind: 'draw'; amount: number }
  | { kind: 'discard'; amount: number }
  | { kind: 'channel'; amount: number; exhausted: boolean }
  | { kind: 'token'; count: number; might: number; name: string; ready: boolean; here: boolean; temporary: boolean }

export type Trigger = 'play' | 'attack' | 'defend' | 'conquer' | 'hold' | 'death' | 'move'

export interface Ability {
  trigger: Trigger
  effects: Effect[]
}

export interface CardScript {
  /** What a spell does when it resolves. */
  spell: Effect[]
  /** A unit's or gear's triggered abilities. */
  abilities: Ability[]
  /** "I enter ready." */
  entersReady: boolean
  /** [Action] or [Reaction]: castable in a showdown. */
  timing: 'action' | 'reaction' | null
  /** Every sentence was understood: the game can run the card by itself. */
  full: boolean
}

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 }
const num = (s: string) => WORDS[s.toLowerCase()] ?? Number(s)

/** Keywords that need nothing from the effect parser: the engine reads them (or they don't matter here). */
/** Hidden is read too: the practice game simply plays such cards normally, face up. */
const QUIET_KEYWORDS = /^(assault|shield|tank|backline|ganking|accelerate|temporary|deflect|vision|ambush|action|reaction|deathknell|hidden)\b/i

/** The text without reminder text, entities and the leftover formatting, as sentences. */
export function sentences(text: string): string[] {
  const clean = text
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/\((?:[^()]|\([^)]*\))*\)/g, ' ')
    .replace(/:rb_might:/g, 'Might')
    .replace(/\s+/g, ' ')
  return clean
    .split(/(?<=[.!])\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** "a unit", "an enemy unit at a battlefield", "all units here", "me", "a friendly unit"... */
function readTarget(phrase: string): Target | null {
  const p = phrase.trim().replace(/\.$/, '').toLowerCase()
  if (p === 'me' || p === 'this' || p === 'it') return { who: 'friendly', where: 'anywhere', all: false, self: true }
  const m = /^(a|an|another|all|each|up to one|)\s*(enemy |friendly |other )?units?(?:\s+you control)?(?:\s+(at a battlefield|at battlefields|here|there))?(?:\s+with (\d+) might or less)?$/.exec(p)
  if (!m) return null
  // "enemy units" with no article means all of them.
  if (!m[1]) {
    if (!/units/.test(p)) return null
    m[1] = 'all'
  }
  const who: Who = m[2]?.startsWith('enemy') ? 'enemy' : m[2]?.startsWith('friendly') || /you control/.test(p) ? 'friendly' : 'any'
  const where = m[3] === 'here' || m[3] === 'there' ? 'here' : m[3] ? 'battlefield' : 'anywhere'
  return { who, where, all: m[1] === 'all' || m[1] === 'each', self: false, ...(m[4] ? { maxMight: Number(m[4]) } : {}) }
}

/** One instruction ("Deal 3 to a unit", "draw 1"), or null when it isn't one of the common ones. */
function readEffect(raw: string): Effect[] | null {
  const s = raw.trim().replace(/\.$/, '').replace(/^you may /i, '').replace(/^then,? /i, '')
  let m: RegExpExecArray | null
  if ((m = /^deal (\d+) to (.+)$/i.exec(s))) {
    const target = readTarget(m[2])
    return target ? [{ kind: 'damage', amount: Number(m[1]), target }] : null
  }
  if ((m = /^give (.+?) ([+-])(\d+) might this turn(?:, to a minimum of (\d+) might)?$/i.exec(s))) {
    const target = readTarget(m[1])
    const amount = Number(m[3]) * (m[2] === '-' ? -1 : 1)
    return target ? [{ kind: 'might', amount, target, ...(m[4] ? { floor: Number(m[4]) } : {}) }] : null
  }
  if ((m = /^(?:\[stun\]|stun) (.+)$/i.exec(s))) {
    const target = readTarget(m[1])
    return target ? [{ kind: 'stun', target }] : null
  }
  if ((m = /^kill (.+)$/i.exec(s))) {
    const target = readTarget(m[1])
    return target ? [{ kind: 'kill', target }] : null
  }
  if ((m = /^(ready|exhaust) (.+)$/i.exec(s))) {
    const target = readTarget(m[2])
    return target ? [{ kind: m[1].toLowerCase() as 'ready' | 'exhaust', target }] : null
  }
  if ((m = /^return (.+?) to (?:its|their) owner'?s'? hands?$/i.exec(s))) {
    const target = readTarget(m[1])
    return target ? [{ kind: 'toHand', target }] : null
  }
  if ((m = /^(?:\[buff\]|buff) (.+)$/i.exec(s))) {
    const target = readTarget(m[1])
    return target ? [{ kind: 'buff', target }] : null
  }
  if ((m = /^draw (\d+|a card|one|two|three)(?: cards?)?$/i.exec(s))) return [{ kind: 'draw', amount: m[1].startsWith('a') ? 1 : num(m[1]) }]
  if ((m = /^discard (\d+|one|two)$/i.exec(s))) return [{ kind: 'discard', amount: num(m[1]) }]
  if ((m = /^channel (\d+|one|two|a) runes?( exhausted)?$/i.exec(s))) return [{ kind: 'channel', amount: num(m[1]), exhausted: !!m[2] }]
  if ((m = /^play (a|an|one|two|three|four) (ready )?(\d+) might ([a-z' ]+?) unit tokens?(?: with \[temporary\])?(?: (?:to|into) your base| here)?$/i.exec(s))) {
    return [{ kind: 'token', count: num(m[1]), ready: !!m[2], might: Number(m[3]), name: m[4].trim(), here: / here$/i.test(s), temporary: /\[temporary\]/i.test(s) }]
  }
  // "X and Y" / "X, then Y": both halves must read.
  const parts = s.split(/,? and (?=(?:deal|give|draw|\[?stun|kill|ready|exhaust|return|buff|channel|play|discard)\b)|, then /i)
  if (parts.length > 1) {
    const read = parts.map(readEffect)
    return read.every(Boolean) ? read.flat() as Effect[] : null
  }
  return null
}

const TRIGGERS: [RegExp, Trigger][] = [
  [/^when you play (?:me|this),? (.+)$/i, 'play'],
  [/^when i attack,? (.+)$/i, 'attack'],
  [/^when i defend,? (.+)$/i, 'defend'],
  [/^when i conquer,? (.+)$/i, 'conquer'],
  [/^when i hold,? (.+)$/i, 'hold'],
  [/^when i move,? (.+)$/i, 'move'],
  [/^\[deathknell\]\s*(?:—\s*)?(?:\[>\]\s*)?(.+)$/i, 'death'],
]

const cache = new Map<string, CardScript>()

/** What the practice game can do with a card's text. */
export function scriptOf(card: Card): CardScript {
  const key = `${card.id}|${card.text ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const script: CardScript = { spell: [], abilities: [], entersReady: false, timing: null, full: true }
  const spell = card.category === 'Spell'
  for (let sentence of sentences(card.text ?? '')) {
    // Leading keywords: timing, and the ones the engine reads elsewhere.
    for (;;) {
      const kw = /^\[([^\]]+)\]\s*/.exec(sentence)
      if (!kw) break
      const name = kw[1]
      if (/^action$/i.test(name)) script.timing ??= 'action'
      else if (/^reaction$/i.test(name)) script.timing = 'reaction'
      else if (/^deathknell$/i.test(name)) break
      else if (!QUIET_KEYWORDS.test(name)) script.full = false
      sentence = sentence.slice(kw[0].length)
    }
    if (!sentence || sentence === '—' || /^no text$/i.test(sentence)) continue
    if (/^i enter ready$/i.test(sentence.replace(/\.$/, ''))) {
      script.entersReady = true
      continue
    }
    const trigger = TRIGGERS.find(([re]) => re.test(sentence))
    if (trigger) {
      const effects = readEffect(trigger[0].exec(sentence)![1])
      if (effects) script.abilities.push({ trigger: trigger[1], effects })
      else script.full = false
      continue
    }
    const effects = readEffect(sentence)
    if (effects && spell) script.spell.push(...effects)
    else script.full = false
  }
  if (spell && !script.spell.length) script.full = false
  cache.set(key, script)
  return script
}

/** A short description of an effect, for the log and the targeting prompt. */
export function describeEffect(e: Effect): string {
  const who = (t: Target) => (t.self ? 'this unit' : `${t.all ? 'all ' : 'a '}${t.who === 'any' ? '' : `${t.who} `}unit${t.all ? 's' : ''}${t.where === 'here' ? ' here' : t.where === 'battlefield' ? ' at a battlefield' : ''}${t.maxMight != null ? ` (${t.maxMight} Might or less)` : ''}`)
  switch (e.kind) {
    case 'damage':
      return `Deal ${e.amount} to ${who(e.target)}`
    case 'might':
      return `${e.amount > 0 ? '+' : ''}${e.amount} Might this turn to ${who(e.target)}`
    case 'stun':
      return `Stun ${who(e.target)}`
    case 'kill':
      return `Kill ${who(e.target)}`
    case 'ready':
      return `Ready ${who(e.target)}`
    case 'exhaust':
      return `Exhaust ${who(e.target)}`
    case 'toHand':
      return `Return ${who(e.target)} to hand`
    case 'buff':
      return `Buff ${who(e.target)}`
    case 'draw':
      return `Draw ${e.amount}`
    case 'discard':
      return `Discard ${e.amount}`
    case 'channel':
      return `Channel ${e.amount}`
    case 'token':
      return `Play ${e.count} ${e.might} Might ${e.name} token${e.count > 1 ? 's' : ''}`
  }
}

/** Effects that need a unit picked (not "all", not "me"). */
export const needsChoice = (e: Effect): e is Extract<Effect, { target: Target }> => 'target' in e && !e.target.all && !e.target.self
