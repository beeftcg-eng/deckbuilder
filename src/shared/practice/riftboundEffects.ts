import type { Card } from '../types'

/**
 * Reading Riftbound card text into effects the practice game can run (riftbound.ts resolves them).
 * Only the common, regular wordings: dealing damage, Might this turn, drawing, stunning, killing,
 * readying and exhausting, returning to hand, unit tokens, channelling, buffing, discarding, and the
 * triggers "When you play me", "When I attack / defend / conquer / hold" and Deathknell, recalling to
 * base, keywords for a turn ([Assault 2], [Ganking]...), countering a spell, "Choose one —" modes, and
 * activated abilities paid by exhausting (":rb_exhaust:: ..." on Legends, gear and units). A card
 * counts as understood (`full`) only when every sentence of its text was read; a spell that isn't
 * still runs what it read up to the first sentence it couldn't (`prefix`), and leaves the rest
 * (`leftover`) to you.
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
  /** Back to its owner's base (recall, or "move ... to its base"). */
  | { kind: 'recall'; target: Target }
  /** A keyword for this turn: [Assault N], [Shield N], [Tank], [Ganking], [Backline]. */
  | { kind: 'keyword'; keyword: TurnKeyword; amount: number; target: Target }
  /** Counters the newest spell on the chain below this one. */
  | { kind: 'counter' }
  /** "Choose one —": the player picks one of these as the card is played. */
  | { kind: 'modes'; modes: Effect[][] }

export type TurnKeyword = 'assault' | 'shield' | 'tank' | 'ganking' | 'backline'

/** An ability you use by exhausting the card (and paying the rest of its cost). */
export interface Activated {
  /** The ability as printed, after the cost. */
  text: string
  energy: number
  power: number
  /** Domains the Power must come from (empty: any). */
  domains: string[]
  /** A cost the game doesn't pay for you ("Kill this", "Discard 1", "Spend 3 XP"), to do with the tools. */
  otherCost: string | null
  timing: 'action' | 'reaction' | null
  /** What it does, when the game can read all of it (null: it's yours to apply). */
  effects: Effect[] | null
  /** [Add] abilities make resources and can't be answered: they resolve at once. */
  add: boolean
}

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
  /** A spell's effects up to the first sentence that couldn't be read (all of them when full). */
  prefix: Effect[]
  /** The text from that sentence on, for you (null when full). */
  leftover: string | null
  /** Abilities used by exhausting the card. */
  activated: Activated[]
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
  if ((m = /^(?:move|return) (.+?)(?: from (a|its) battlefield)? to (?:its|their) (?:owner'?s'? )?bases?$/i.exec(s)) || (m = /^recall (.+?)()$/i.exec(s))) {
    const target = readTarget(m[1])
    if (target && m[2]) target.where = 'battlefield'
    return target ? [{ kind: 'recall', target }] : null
  }
  if ((m = /^give (.+?) ((?:\[(?:assault|shield|tank|ganking|backline)(?: \d+)?\](?:,? (?:and )?)?)+) this turn$/i.exec(s))) {
    const target = readTarget(m[1])
    if (!target) return null
    return [...m[2].matchAll(/\[(assault|shield|tank|ganking|backline)(?: (\d+))?\]/gi)].map((k) => ({ kind: 'keyword' as const, keyword: k[1].toLowerCase() as TurnKeyword, amount: k[2] ? Number(k[2]) : 1, target: { ...target } }))
  }
  if (/^counter a spell$/i.test(s)) return [{ kind: 'counter' }]
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

/** "Kill this, :rb_energy_1:, :rb_exhaust:" -> what the game can pay, and what it leaves to you. */
function readCost(cost: string): Pick<Activated, 'energy' | 'power' | 'domains' | 'otherCost'> {
  let energy = 0
  let power = 0
  const domains = new Set<string>()
  const rest = cost
    .replace(/:rb_energy_(\d+):/g, (_, n) => {
      energy += Number(n)
      return ''
    })
    .replace(/:rb_rune_(\w+):/g, (_, d: string) => {
      power += 1
      if (d !== 'rainbow') domains.add(d[0].toUpperCase() + d.slice(1))
      return ''
    })
    .replace(/:rb_exhaust:/g, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
    .replace(/\s*,\s*,\s*/g, ', ')
  return { energy, power, domains: [...domains], otherCost: rest || null }
}

const EXHAUST = ':rb_exhaust::'

/** What the practice game can do with a card's text. */
export function scriptOf(card: Card): CardScript {
  const key = `${card.id}|${card.text ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  const script: CardScript = { spell: [], abilities: [], entersReady: false, timing: null, full: true, prefix: [], leftover: null, activated: [] }
  const spell = card.category === 'Spell'
  const all = sentences(card.text ?? '')
  /** The first sentence not read, for a spell's leftover. */
  let brokeAt: number | null = null
  const unread = (i: number) => {
    script.full = false
    if (brokeAt == null) brokeAt = i
  }
  for (let i = 0; i < all.length; i++) {
    let sentence = all[i]
    let timing: 'action' | 'reaction' | null = null
    // Leading keywords: timing, and the ones the engine reads elsewhere.
    for (;;) {
      const kw = /^\[([^\]]+)\]\s*/.exec(sentence)
      if (!kw) break
      const name = kw[1]
      if (/^action$/i.test(name)) timing ??= 'action'
      else if (/^reaction$/i.test(name)) timing = 'reaction'
      else if (/^deathknell$/i.test(name)) break
      else if (name === '>' || name === '&gt;') {
        // "[Action][>] ..." just joins a timing to what follows.
      } else if (!QUIET_KEYWORDS.test(name)) unread(i)
      sentence = sentence.slice(kw[0].length)
    }
    // An ability paid by exhausting: its cost, then what it does, to the next ability or trigger.
    const at = sentence.indexOf(EXHAUST)
    if (at >= 0) {
      let body = sentence.slice(at + EXHAUST.length).trim()
      const own = /^\[(action|reaction)\]\s*(?:—\s*)?/i.exec(body)
      if (own) {
        timing = own[1].toLowerCase() as 'action' | 'reaction'
        body = body.slice(own[0].length)
      }
      const parts = [body]
      while (i + 1 < all.length && !all[i + 1].includes('::') && !/^(when|\[|at start|use only)/i.test(all[i + 1])) parts.push(all[++i])
      const add = /\[add\]/i.test(body)
      const read = add ? null : parts.map(readEffect)
      script.activated.push({
        text: parts.join(' '),
        ...readCost(sentence.slice(0, at + EXHAUST.length - 1)),
        timing,
        effects: read && read.every(Boolean) ? (read.flat() as Effect[]) : null,
        add,
      })
      continue
    }
    if (timing) script.timing = script.timing === 'reaction' ? 'reaction' : timing
    if (!sentence || sentence === '—' || /^no text$/i.test(sentence)) continue
    if (/^i enter ready$/i.test(sentence.replace(/\.$/, ''))) {
      script.entersReady = true
      continue
    }
    // "Choose one —": this sentence's rest and every one after it are the choices.
    const choose = /^choose one\s*—\s*(.+)$/i.exec(sentence)
    if (choose && spell) {
      const modes = [choose[1], ...all.slice(i + 1)].map(readEffect)
      if (modes.every(Boolean)) {
        script.spell.push({ kind: 'modes', modes: modes as Effect[][] })
        if (brokeAt == null) script.prefix.push({ kind: 'modes', modes: modes as Effect[][] })
      } else unread(i)
      break
    }
    const trigger = TRIGGERS.find(([re]) => re.test(sentence))
    if (trigger) {
      const effects = readEffect(trigger[0].exec(sentence)![1])
      if (effects) script.abilities.push({ trigger: trigger[1], effects })
      else unread(i)
      continue
    }
    const effects = readEffect(sentence)
    if (effects && spell) {
      script.spell.push(...effects)
      if (brokeAt == null) script.prefix.push(...effects)
    } else unread(i)
  }
  if (spell && !script.spell.length) {
    script.full = false
    brokeAt ??= 0
  }
  if (brokeAt != null) script.leftover = all.slice(brokeAt).join(' ') || null
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
    case 'recall':
      return `Send ${who(e.target)} back to base`
    case 'keyword':
      return `Give ${who(e.target)} [${e.keyword[0].toUpperCase()}${e.keyword.slice(1)}${e.keyword === 'assault' || e.keyword === 'shield' ? ` ${e.amount}` : ''}] this turn`
    case 'counter':
      return 'Counter a spell'
    case 'modes':
      return e.modes.map((m) => m.map(describeEffect).join(', ')).join(' or ')
  }
}

/** Effects that need a unit picked (not "all", not "me"). */
export const needsChoice = (e: Effect): e is Extract<Effect, { target: Target }> => 'target' in e && !e.target.all && !e.target.self
