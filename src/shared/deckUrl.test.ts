import { describe, expect, it } from 'vitest'
import { applySiteExtras, deckUrlTarget, fromArchidekt, fromLimitlessOnePiece, fromLimitlessPokemon } from './deckUrl'
import { parseDecklistText } from './importDeck'
import { mtgAdapter } from './games/mtg'
import { catalogOf, makeCard } from './testFixtures'

describe('deck links', () => {
  it('knows the deck sites it can read, and nothing else', () => {
    expect(deckUrlTarget('https://archidekt.com/decks/123456/my_deck')).toEqual({ site: 'archidekt', gameId: 'mtg', fetchUrl: 'https://archidekt.com/api/decks/123456/' })
    expect(deckUrlTarget(' https://limitlesstcg.com/decks/list/13893 ')?.site).toBe('limitless-pokemon')
    expect(deckUrlTarget('https://onepiece.limitlesstcg.com/decks/list/1000')?.gameId).toBe('onepiece')
    expect(deckUrlTarget('https://www.moxfield.com/decks/abc')).toBeNull()
    expect(deckUrlTarget('https://archidekt.com.evil.example/decks/1')).toBeNull()
    expect(deckUrlTarget('4 Lightning Bolt')).toBeNull()
  })

  it("reads Limitless' Pokémon and One Piece lists", () => {
    const pokemon = `<div class="decklist-title">
            Charizard &amp; Pidgeot
      </div>
      <div class="decklist-card" data-set="PAF" data-number="7" data-lang="en"  >
            <a class="card-link" href="/cards/PAF/7">
                <span class="card-count">3</span>
                <span class="card-name">Charmander</span>`
    expect(fromLimitlessPokemon(pokemon)).toMatchObject({ name: 'Charizard & Pidgeot', text: '3 Charmander PAF 7' })
    const onePiece = `<div class="decklist-card" data-count="1" data-id="OP01-001" data-variant="0" data-lang="en">
      <div class="decklist-card" data-count="4" data-id="OP01-006" data-variant="1" data-lang="en">`
    expect(fromLimitlessOnePiece(onePiece).text).toBe('1xOP01-001\n4xOP01-006')
  })

  it("reads Archidekt's zones, exact printings and categories, leaving out the maybeboard", () => {
    const site = fromArchidekt({
      name: 'Bolts',
      categories: [
        { name: 'Maybeboard', includedInDeck: false },
        { name: 'Removal', includedInDeck: true },
      ],
      cards: [
        { quantity: 4, categories: ['Removal'], card: { uid: 'bolt-2xm', oracleCard: { name: 'Lightning Bolt' } } },
        { quantity: 2, categories: ['Sideboard'], card: { uid: 'negate-1', oracleCard: { name: 'Negate' } } },
        { quantity: 1, categories: ['Maybeboard'], card: { uid: 'x', oracleCard: { name: 'Shock' } } },
      ],
    })
    expect(site.name).toBe('Bolts')
    expect(site.text).toBe('Main Deck\n4 Lightning Bolt\n\nSideboard\n2 Negate')
    expect(site.tags.get('Lightning Bolt')).toEqual(['Removal'])

    // The text import picks a printing by itself; the site's exact one is put back, with its tags.
    const regular = makeCard('mtg', { id: 'mtg:oracle-bolt', sourceId: 'oracle-bolt', name: 'Lightning Bolt', imageUrl: 'https://img/oracle-bolt.jpg' })
    const doubleMasters = makeCard('mtg', { id: 'mtg:bolt-2xm', sourceId: 'oracle-bolt', name: 'Lightning Bolt', setId: '2xm', imageUrl: 'https://img/bolt-2xm.jpg' })
    const negate = makeCard('mtg', { name: 'Negate' })
    const byId = catalogOf([regular, doubleMasters, negate])
    const parsed = parseDecklistText(site.text, mtgAdapter, byId, 'modern')
    const { parsed: exact, tags } = applySiteExtras(parsed, site, byId)
    expect(exact.zones.main).toEqual([{ cardId: 'mtg:bolt-2xm', quantity: 4 }])
    expect(exact.zones.sideboard).toEqual([{ cardId: negate.id, quantity: 2 }])
    expect(Object.values(tags)).toEqual([['Removal']])
  })
})
