import { describe, expect, it } from 'vitest'
import { dropEarlyDuplicates, riftboundAdapter } from './riftbound'
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

describe('dropEarlyDuplicates', () => {
  it("drops riftcodex's early entry for a printing and remembers its id on the current one", () => {
    const early = makeCard('riftbound', { id: 'riftbound:early', name: 'Matriarch of War', sourceId: 'ven-196-166' })
    const current = makeCard('riftbound', { id: 'riftbound:current', name: 'Ambessa - Matriarch of War (Overnumbered)', sourceId: 'ven-196-166', tcgplayerId: '706061' })
    const metal = makeCard('riftbound', { id: 'riftbound:metal', name: 'Jinx - Loose Cannon (Metal)', sourceId: 'opp-251-298', tcgplayerId: '669252' })
    const regular = makeCard('riftbound', { id: 'riftbound:regular', name: 'Jinx - Loose Cannon', sourceId: 'opp-251-298', tcgplayerId: '662894' })
    const cards = dropEarlyDuplicates([early, current, metal, regular])
    expect(cards.map((c) => c.id)).toEqual(['riftbound:current', 'riftbound:metal', 'riftbound:regular'])
    expect(cards[0].formerIds).toEqual(['riftbound:early'])
  })
})
