import { describe, expect, it } from 'vitest'
import { allTags, cleanTags, parseTags, sanitizeTags, tagsOf, withTags } from './deckTags'
import { buildDeckView } from './deckView'
import { mtgAdapter } from './games/mtg'
import { rulesForFormat } from './games/rules'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

const sol = makeCard('mtg', { name: 'Sol Ring', category: 'Artifact' })
const solReprint = makeCard('mtg', { name: 'Sol Ring', category: 'Artifact', setId: 'cmm' })
const bolt = makeCard('mtg', { name: 'Lightning Bolt', category: 'Instant' })
const forest = makeCard('mtg', { name: 'Forest', category: 'Land' })

describe('deck tags', () => {
  it('reads tags typed with commas, without repeats or blanks', () => {
    expect(parseTags(' ramp, Removal ;removal,, draw ')).toEqual(['ramp', 'Removal', 'draw'])
    expect(cleanTags(Array.from({ length: 12 }, (_, i) => `t${i}`))).toHaveLength(8)
  })

  it('keeps tags per card, shared by every printing', () => {
    const deck = withTags(makeDeck('mtg', { main: [[sol, 1]] }), sol, ['ramp'])
    expect(tagsOf(deck, solReprint)).toEqual(['ramp'])
    expect(withTags(deck, sol, []).tags).toBeUndefined()
  })

  it('suggests the most used tags first', () => {
    let deck = makeDeck('mtg', {})
    deck = withTags(deck, sol, ['ramp', 'artifact'])
    deck = withTags(deck, bolt, ['removal', 'Ramp'])
    expect(allTags(deck)).toEqual(['ramp', 'artifact', 'removal'])
  })

  it('groups the deck view by tag, a card under each of its tags and untagged cards last', () => {
    let deck = makeDeck('mtg', { main: [[forest, 30], [sol, 1], [bolt, 4]] })
    deck = withTags(deck, sol, ['ramp'])
    deck = withTags(deck, bolt, ['removal', 'ramp'])
    const [main] = buildDeckView(deck, rulesForFormat(mtgAdapter, 'modern'), catalogOf([sol, bolt, forest]), 'tag')
    expect(main.groups.map((g) => [g.category, g.count])).toEqual([['ramp', 5], ['removal', 4], ['', 30]])
    expect(main.count).toBe(35)
  })

  it('reads only well-formed tags from a share link', () => {
    expect(sanitizeTags({ 'mtg:sol ring': ['ramp', 3], x: 'nope' })).toEqual({ 'mtg:sol ring': ['ramp'] })
    expect(sanitizeTags(null)).toBeUndefined()
  })
})
