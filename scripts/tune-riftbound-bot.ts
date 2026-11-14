/**
 * Tunes the Riftbound practice bot's weights (src/shared/practice/riftboundBot.ts DEFAULT_WEIGHTS) by
 * bot-vs-bot games: each candidate set of weights plays the current defaults with real recent lists
 * (the published Community lists), swapping sides and decks every game. Prints each candidate's win
 * rate against the defaults; a clear winner is worth copying into DEFAULT_WEIGHTS.
 *
 *   npx rolldown scripts/tune-riftbound-bot.ts --platform node --format esm -o .tune/tune.mjs
 *   node .tune/tune.mjs [games per candidate, default 40] [level, default normal]
 *
 * Card data comes from riftcodex (the app's own download, with each unit's Might), the lists from
 * the deployed community/riftbound.json. Needs the network; takes a few minutes.
 */
import { getAdapter } from '../src/shared/games/registry.ts'
import { uniquifyCardIds } from '../src/shared/cardIds.ts'
import { communityGame } from '../src/shared/communityGames.ts'
import { listDeck } from '../src/shared/communityMeta.ts'
import { COMMUNITY_FILE_URL, readCommunityListsFile } from '../src/shared/communityLists.ts'
import { endTurn, newGame, pass, type DeckSetup, type GameState, type Side } from '../src/shared/practice/riftbound.ts'
import { DEFAULT_WEIGHTS, botAct, botShouldAct, setupFromDeck, type Level, type Weights } from '../src/shared/practice/riftboundBot.ts'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

/** One game between two weight sets; returns the winning side, or null after too many decisions. */
function playGame(a: DeckSetup, b: DeckSetup, weights: [Weights, Weights], level: Level | [Level, Level], seed: number, first: Side): Side | null {
  const levels: [Level, Level] = Array.isArray(level) ? level : [level, level]
  const random = seeded(seed)
  let s: GameState = newGame(a, b, { first, random })
  for (let step = 0; step < 3000 && s.phase !== 'over'; step++) {
    const side = ([0, 1] as Side[]).find((x) => botShouldAct(s, x))
    if (side == null) {
      // Nobody's move: a chain or showdown nobody owns, or a stuck turn. Move it along.
      s = s.chain?.items.length ? pass(s, s.chain.priority) : s.showdown ? pass(s, s.showdown.focus) : endTurn(s)
      continue
    }
    const next = botAct(s, side, levels[side], weights[side], random)
    s = next === s ? (s.chain?.items.length || s.showdown ? pass(s, side) : endTurn(s)) : next
  }
  return s.winner
}

async function main() {
  const games = Number(process.argv[2] ?? 40)
  const level = (process.argv[3] ?? 'normal') as Level
  console.log('Downloading Riftbound cards and Community lists...')
  const cards = uniquifyCardIds(await getAdapter('riftbound').fetchAllCards(() => {}))
  const byId = new Map(cards.map((c) => [c.id, c]))
  const file = readCommunityListsFile(await (await fetch(COMMUNITY_FILE_URL)).json())
  if (!file) throw new Error('No Community lists')
  const index = communityGame('riftbound').index(cards)
  const decks: DeckSetup[] = []
  for (const list of file.lists) {
    const d = listDeck(list, index)
    if (!d) continue
    const setup = setupFromDeck(d, byId)
    if (setup.legend && setup.main.length >= 30 && setup.runes.length && setup.battlefields.length) decks.push(setup)
    if (decks.length >= 40) break
  }
  console.log(`${cards.length} cards, ${decks.length} decks; ${games} games per candidate at ${level}.`)
  if (process.env.DEBUG_GAME) {
    let s = newGame(decks[0], decks[1], { first: 0, random: seeded(1) })
    for (let step = 0; step < 60 && s.phase !== 'over'; step++) {
      const side = ([0, 1] as Side[]).find((x) => botShouldAct(s, x))
      console.log(step, s.phase, 'active', s.active, 'acts', side, 'pts', s.players[0].points, s.players[1].points, s.log.at(-1)?.text)
      if (side == null) s = s.showdown ? pass(s, s.showdown.focus) : endTurn(s)
      else s = botAct(s, side, level, DEFAULT_WEIGHTS, seeded(2))
    }
    return
  }

  const candidates: [string, Weights][] = [
    ['defaults (vs itself)', DEFAULT_WEIGHTS],
    ['more points', { ...DEFAULT_WEIGHTS, points: 14 }],
    ['more control', { ...DEFAULT_WEIGHTS, control: 9 }],
    ['less control', { ...DEFAULT_WEIGHTS, control: 3 }],
    ['more Might', { ...DEFAULT_WEIGHTS, might: 1.2 }],
    ['less Might', { ...DEFAULT_WEIGHTS, might: 0.3 }],
    ['more cards', { ...DEFAULT_WEIGHTS, cards: 1.6 }],
    ['fewer cards', { ...DEFAULT_WEIGHTS, cards: 0.3 }],
    ['more threat', { ...DEFAULT_WEIGHTS, threat: 8 }],
    ['more reserve', { ...DEFAULT_WEIGHTS, reserve: 0.8 }],
  ]
  // The levels against each other: each should beat the one below.
  for (const [better, worse] of [['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']] as [Level, Level][]) {
    let wins = 0
    let played = 0
    for (let g = 0; g < games; g++) {
      const a = decks[(g * 7) % decks.length]
      const b = decks[(g * 13 + 5) % decks.length]
      const first: Side = g % 2 === 0 ? 0 : 1
      for (const side of [0, 1] as Side[]) {
        const levels: [Level, Level] = side === 0 ? [better, worse] : [worse, better]
        const winner = playGame(a, b, [DEFAULT_WEIGHTS, DEFAULT_WEIGHTS], levels, 2000 + g, first)
        if (winner == null) continue
        played++
        if (winner === side) wins++
      }
    }
    console.log(`${better} vs ${worse}`.padEnd(22), `${played ? ((100 * wins) / played).toFixed(0) : '–'}% of ${played}`, played < games * 2 ? `(${games * 2 - played} unfinished)` : '')
  }
  if (process.env.LEVELS_ONLY) return

  for (const [name, w] of candidates) {
    let wins = 0
    let played = 0
    let firstWins = 0
    const start = Date.now()
    for (let g = 0; g < games; g++) {
      const a = decks[(g * 7) % decks.length]
      const b = decks[(g * 13 + 5) % decks.length]
      // Who goes first changes every game. Each matchup is played twice, the candidate on each deck
      // and side, so deck strength and going first even out.
      const first: Side = g % 2 === 0 ? 0 : 1
      for (const candidateSide of [0, 1] as Side[]) {
        const weights: [Weights, Weights] = candidateSide === 0 ? [w, DEFAULT_WEIGHTS] : [DEFAULT_WEIGHTS, w]
        const winner = playGame(a, b, weights, level, 1000 + g, first)
        if (winner == null) continue
        played++
        if (winner === candidateSide) wins++
        if (winner === first) firstWins++
      }
    }
    console.log(`${name.padEnd(22)} ${played ? ((100 * wins) / played).toFixed(0) : '–'}% of ${played}  (first player won ${played ? ((100 * firstWins) / played).toFixed(0) : '–'}%, ${((Date.now() - start) / 1000).toFixed(0)}s)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
