import { describe, expect, it } from 'vitest'
import { parseDecklistText } from './importDeck'
import { buildExportText } from './export'
import { onepieceAdapter } from './games/onepiece'
import { riftboundAdapter } from './games/riftbound'
import { pokemonAdapter } from './games/pokemon'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

describe('parseDecklistText', () => {
  describe('One Piece', () => {
    const leader = makeCard('onepiece', { name: 'Roronoa Zoro', sourceId: 'OP01-001', category: 'Leader' })
    const luffy = makeCard('onepiece', { name: 'Monkey.D.Luffy', sourceId: 'OP01-003', category: 'Character' })
    const luffyAlt = makeCard('onepiece', { name: 'Monkey.D.Luffy', sourceId: 'OP01-003', id: 'onepiece:OP01-003_p1', category: 'Character' })
    const perona = makeCard('onepiece', { name: 'Perona', sourceId: 'OP01-077', category: 'Character' })
    const catalog = catalogOf([leader, luffy, luffyAlt, perona])

    it('round-trips its own export, including name and format', () => {
      const deck = makeDeck('onepiece', { leader: [[leader, 1]], main: [[luffy, 4], [perona, 2]] })
      const text = buildExportText(deck, onepieceAdapter, 'Standard (current rotation + ban list)', catalog)
      const parsed = parseDecklistText(text, onepieceAdapter, catalog)

      expect(parsed.name).toBe('Test Deck')
      expect(parsed.formatLabel).toBe('Standard (current rotation + ban list)')
      expect(parsed.zones.leader).toEqual([{ cardId: leader.id, quantity: 1 }])
      expect(parsed.zones.main).toEqual([
        { cardId: luffy.id, quantity: 4 },
        { cardId: perona.id, quantity: 2 },
      ])
      expect(parsed.unmatched).toEqual([])
    })

    it('reads compact community lists and picks the base printing of a reprinted number', () => {
      const parsed = parseDecklistText('1xOP01-001\n4xOP01-003\n2 OP01-077', onepieceAdapter, catalog)
      expect(parsed.zones.leader).toEqual([{ cardId: leader.id, quantity: 1 }])
      expect(parsed.zones.main).toEqual([
        { cardId: luffy.id, quantity: 4 },
        { cardId: perona.id, quantity: 2 },
      ])
    })

    it('falls back to matching by name and reports what it cannot match', () => {
      const parsed = parseDecklistText('3 Perona\n2 Nobody Real\nnot a card line', onepieceAdapter, catalog)
      expect(parsed.zones.main).toEqual([{ cardId: perona.id, quantity: 3 }])
      expect(parsed.unmatched).toEqual(['2 Nobody Real'])
    })
  })

  describe('Riftbound', () => {
    const legend = makeCard('riftbound', { name: 'Vi - Piltover Enforcer', sourceId: 'unl-229-219', category: 'Legend', colors: ['Fury', 'Order'] })
    const champion = makeCard('riftbound', { name: 'Vi, Champion', sourceId: 'unl-100-219', subtypes: ['Champion'], colors: ['Fury'] })
    const unit = makeCard('riftbound', { name: 'Brawler', sourceId: 'unl-101-219', colors: ['Order'] })
    const sideCard = makeCard('riftbound', { name: 'Side Spell', sourceId: 'unl-102-219', category: 'Spell', colors: ['Fury'] })
    const bf1 = makeCard('riftbound', { name: 'Arena One', sourceId: 'unl-201-219', category: 'Battlefield' })
    const bf2 = makeCard('riftbound', { name: 'Arena Two', sourceId: 'unl-202*-219', category: 'Battlefield' })
    const catalog = catalogOf([legend, champion, unit, sideCard, bf1, bf2])

    it('round-trips zones, runes, battlefields and sideboard', () => {
      const deck = makeDeck(
        'riftbound',
        {
          legend: [[legend, 1]],
          main: [[champion, 1], [unit, 3]],
          battlefields: [[bf1, 1], [bf2, 1]],
          sideboard: [[sideCard, 2]],
        },
        { runes: [{ label: 'Fury', quantity: 7 }, { label: 'Order', quantity: 5 }] },
      )
      const parsed = parseDecklistText(buildExportText(deck, riftboundAdapter, 'Constructed', catalog), riftboundAdapter, catalog)

      expect(parsed.zones.legend).toEqual(deck.zones.legend)
      expect(parsed.zones.main).toEqual(deck.zones.main)
      expect(parsed.zones.battlefields).toEqual(deck.zones.battlefields)
      expect(parsed.zones.sideboard).toEqual(deck.zones.sideboard)
      expect(parsed.freeTextZones.runes).toEqual(deck.freeTextZones.runes)
      expect(parsed.unmatched).toEqual([])
    })

    it('keeps the same card in main and sideboard apart by header', () => {
      const text = 'Main Deck (1/40):\n1x unl-102-219 Side Spell\n\nSideboard (1/10):\n2x unl-102-219 Side Spell'
      const parsed = parseDecklistText(text, riftboundAdapter, catalog)
      expect(parsed.zones.main).toEqual([{ cardId: sideCard.id, quantity: 1 }])
      expect(parsed.zones.sideboard).toEqual([{ cardId: sideCard.id, quantity: 2 }])
    })
  })

  describe('Pokémon', () => {
    const research = makeCard('pokemon', { name: "Professor's Research", sourceId: 'sv1-189', setCode: 'SVI', number: '189', category: 'Trainer' })
    const fire = makeCard('pokemon', { name: 'Basic Fire Energy', sourceId: 'sve-2', setCode: 'SVE', number: '2', category: 'Energy', subtypes: ['Basic'] })
    const xerneas = makeCard('pokemon', { name: 'Xerneas', sourceId: 'xy1-95', setCode: 'XY', number: '95', category: 'Pokémon' })
    const catalog = catalogOf([research, fire, xerneas])

    it('matches PTCGL-style lines by set code and number, ignoring section headers', () => {
      const text = "Pokémon: 4\n4 Xerneas XY 95\n\nTrainer: 4\n4 Professor's Research SVI 189\n\nEnergy: 8\n8 Basic Fire Energy SVE 2\n\nTotal Cards: 16"
      const parsed = parseDecklistText(text, pokemonAdapter, catalog)
      expect(parsed.zones.main).toEqual([
        { cardId: xerneas.id, quantity: 4 },
        { cardId: research.id, quantity: 4 },
        { cardId: fire.id, quantity: 8 },
      ])
      expect(parsed.unmatched).toEqual([])
    })

    it('does not mistake a leading X in a name for a multiplier', () => {
      const parsed = parseDecklistText('2 Xerneas', pokemonAdapter, catalog)
      expect(parsed.zones.main).toEqual([{ cardId: xerneas.id, quantity: 2 }])
    })

    it('matches names with curly apostrophes and accents', () => {
      const parsed = parseDecklistText('3 Professor’s Research', pokemonAdapter, catalog)
      expect(parsed.zones.main).toEqual([{ cardId: research.id, quantity: 3 }])
    })
  })
})
