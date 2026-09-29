import { describe, expect, it } from 'vitest'
import { deckFolders, groupByFolder } from './deckFolders'
import { makeDeck } from './testFixtures'

const deck = (name: string, folder?: string) => ({ ...makeDeck('mtg', {}), id: name, name, ...(folder ? { folder } : {}) })

describe('deck folders', () => {
  const decks = [deck('a', 'Tournament'), deck('b'), deck('c', 'Casual'), deck('d', 'Tournament'), deck('e')]

  it('lists the folders in use, A–Z, once each', () => {
    expect(deckFolders(decks)).toEqual(['Casual', 'Tournament'])
  })

  it('groups decks with the unfiled ones first, keeping each group in the given order', () => {
    expect(groupByFolder(decks).map((g) => [g.folder, g.decks.map((d) => d.name)])).toEqual([
      [null, ['b', 'e']],
      ['Casual', ['c']],
      ['Tournament', ['a', 'd']],
    ])
    expect(groupByFolder([deck('x', 'Only')]).map((g) => g.folder)).toEqual(['Only'])
  })
})
