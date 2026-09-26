import { describe, expect, it } from 'vitest'
import { riftboundAdapter } from './riftbound'
import { buildExportText } from '../export'
import { catalogOf, makeCard, makeDeck } from '../testFixtures'

describe('Riftbound decklist export', () => {
  const legend = makeCard('riftbound', { name: 'Kayle - Righteous', sourceId: 'ven-200-166', category: 'Legend' })
  const otherChampion = makeCard('riftbound', { name: 'Kennen, Keeper of Balance', sourceId: 'ven-135-166', subtypes: ['Champion'] })
  const champion = makeCard('riftbound', { name: 'Kayle, Justified', sourceId: 'ven-134-166', subtypes: ['Champion'] })
  const championAlt = makeCard('riftbound', { name: 'Kayle, Justified (Alternate Art)', sourceId: 'ven-134a-166', subtypes: ['Champion'] })
  const spell = makeCard('riftbound', { name: 'Ki Barrier', sourceId: 'ven-126-166', category: 'Spell' })
  const bf = makeCard('riftbound', { name: 'Sunken Temple', sourceId: 'sfd-218-221', category: 'Battlefield' })
  const catalog = catalogOf([legend, otherChampion, champion, championAlt, spell, bf])
  const deck = makeDeck(
    'riftbound',
    {
      legend: [[legend, 1]],
      main: [[otherChampion, 2], [champion, 2], [championAlt, 1], [spell, 3]],
      battlefields: [[bf, 1]],
      sideboard: [[spell, 2]],
    },
    { runes: [{ label: 'Order', quantity: 6 }, { label: 'Body', quantity: 6 }] },
  )

  // What Riot's event locator and Piltover Archive import: plain headings, bare card names (comma
  // titles, no printing suffix), rune card names, and the chosen Champion split out of MainDeck.
  it("writes Piltover Archive's text format, with the Legend's Champion as the chosen Champion", () => {
    expect(buildExportText(deck, riftboundAdapter, 'Constructed', catalog)).toBe(
      [
        'Legend:',
        '1 Kayle, Righteous',
        '',
        'Champion:',
        '1 Kayle, Justified',
        '',
        'MainDeck:',
        '2 Kennen, Keeper of Balance',
        '2 Kayle, Justified',
        '3 Ki Barrier',
        '',
        'Battlefields:',
        '1 Sunken Temple',
        '',
        'Runes:',
        '6 Order Rune',
        '6 Body Rune',
        '',
        'Sideboard:',
        '2 Ki Barrier',
        '',
      ].join('\n'),
    )
  })

  it("falls back to the first Champion when none matches the Legend", () => {
    const noMatch = makeDeck('riftbound', { legend: [[legend, 1]], main: [[otherChampion, 3]] })
    const text = buildExportText(noMatch, riftboundAdapter, 'Constructed', catalog)
    expect(text).toContain('Champion:\n1 Kennen, Keeper of Balance\n\nMainDeck:\n2 Kennen, Keeper of Balance')
  })
})
