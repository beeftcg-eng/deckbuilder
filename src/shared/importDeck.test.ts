import { describe, expect, it } from 'vitest'
import { detectFormatFromHeadings, parseDecklistText } from './importDeck'
import { buildExportText } from './export'
import { onepieceAdapter } from './games/onepiece'
import { riftboundAdapter } from './games/riftbound'
import { pokemonAdapter } from './games/pokemon'
import { mtgAdapter } from './games/mtg'
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

    // Rift Atlas exports (and riftcodex's own card data is itself inconsistent about this) write a
    // Legend/Champion's title with a comma ("Irelia, Blade Dancer") even for cards whose real name
    // uses a dash instead ("Irelia - Blade Dancer") - a real bug report reproduced these three
    // issues together from one real Rift Atlas export.
    const dashLegend = makeCard('riftbound', { name: 'Irelia - Blade Dancer', sourceId: 'unl-300-219', category: 'Legend' })
    const calmRune = makeCard('riftbound', { name: 'Calm Rune', sourceId: 'unl-301-219', category: 'Rune', subtypes: ['Basic'] })
    const chaosRune = makeCard('riftbound', { name: 'Chaos Rune', sourceId: 'unl-302-219', category: 'Rune', subtypes: ['Basic'] })
    const runeCatalog = catalogOf([dashLegend, champion, unit, sideCard, bf1, bf2, calmRune, chaosRune])

    it('matches a Legend/Champion whose title uses " - " even when the list writes it with ", ", and vice versa', () => {
      const text = 'Legend:\n1 Irelia, Blade Dancer'
      const parsed = parseDecklistText(text, riftboundAdapter, runeCatalog)
      expect(parsed.zones.legend).toEqual([{ cardId: dashLegend.id, quantity: 1 }])
      expect(parsed.unmatched).toEqual([])
    })

    it('recognizes "<Domain> Rune" as the Rune Deck pick, not the literal "Calm Rune"/"Chaos Rune" cards that also exist in the catalog', () => {
      const text = 'Runes:\n6 Calm Rune\n6 Chaos Rune'
      const parsed = parseDecklistText(text, riftboundAdapter, runeCatalog)
      expect(parsed.freeTextZones.runes).toEqual([
        { label: 'Calm', quantity: 6 },
        { label: 'Chaos', quantity: 6 },
      ])
      expect(parsed.zones.main ?? []).toEqual([]) // not misfiled as real cards into Main Deck
      expect(parsed.unmatched).toEqual([])
    })

    it('parses a full real-world Rift Atlas export correctly: Legend, Champion, Battlefields, Runes and Sideboard each in their own place', () => {
      const text = [
        'Legend:',
        '1 Irelia, Blade Dancer',
        '',
        'Champion:',
        '1 Vi, Champion',
        '',
        'MainDeck:',
        '3 Brawler',
        '',
        'Battlefields:',
        '1 Arena One',
        '',
        'Runes:',
        '6 Calm Rune',
        '6 Chaos Rune',
        '',
        'Sideboard:',
        '2 Side Spell',
      ].join('\n')
      const parsed = parseDecklistText(text, riftboundAdapter, runeCatalog)
      expect(parsed.zones.legend).toEqual([{ cardId: dashLegend.id, quantity: 1 }])
      expect(parsed.zones.main).toEqual(expect.arrayContaining([{ cardId: champion.id, quantity: 1 }, { cardId: unit.id, quantity: 3 }]))
      expect(parsed.zones.main).toHaveLength(2) // no runes bled into it
      expect(parsed.zones.battlefields).toEqual([{ cardId: bf1.id, quantity: 1 }])
      expect(parsed.zones.sideboard).toEqual([{ cardId: sideCard.id, quantity: 2 }])
      expect(parsed.freeTextZones.runes).toEqual([
        { label: 'Calm', quantity: 6 },
        { label: 'Chaos', quantity: 6 },
      ])
      expect(parsed.unmatched).toEqual([])
    })

    // RiftMana's "Card Names" export (checked live against the site) has no section headers at
    // all - just "<qty> <name>" lines, one per line, relying entirely on card type to sort them.
    it('sorts a fully headerless export (RiftMana-style) by card type alone, including runes', () => {
      const text = ['1 Irelia - Blade Dancer', '1 Vi, Champion', '3 Brawler', '1 Arena One', '6 Calm Rune', '6 Chaos Rune', '2 Side Spell'].join('\n')
      const parsed = parseDecklistText(text, riftboundAdapter, runeCatalog)
      expect(parsed.zones.legend).toEqual([{ cardId: dashLegend.id, quantity: 1 }])
      expect(parsed.zones.main).toEqual(expect.arrayContaining([{ cardId: champion.id, quantity: 1 }, { cardId: unit.id, quantity: 3 }]))
      expect(parsed.zones.battlefields).toEqual([{ cardId: bf1.id, quantity: 1 }])
      expect(parsed.freeTextZones.runes).toEqual([
        { label: 'Calm', quantity: 6 },
        { label: 'Chaos', quantity: 6 },
      ])
      // No heading ever said "Sideboard", so this app has no way to know these 2 copies of a card
      // already in Main belong in the optional 10-card Sideboard instead - they just add to Main.
      expect(parsed.zones.sideboard ?? []).toEqual([])
    })

    // Piltover Archive, Riftbound Zone and Magical Meta (checked live) all break Champions out
    // under their own heading, even though this app has no separate Champion zone - a Champion is
    // just a Unit that lives in the Main Deck.
    it('recognizes a "Champion:" heading as the Main Deck, matching sites that break it out separately', () => {
      const text = 'Champion:\n1 Vi, Champion'
      const parsed = parseDecklistText(text, riftboundAdapter, catalog)
      expect(parsed.zones.main).toEqual([{ cardId: champion.id, quantity: 1 }])
      expect(parsed.unmatched).toEqual([])
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

describe('parseDecklistText: Magic', () => {
  const mtg = (name: string, over: Record<string, unknown> = {}) => makeCard('mtg', { name, category: 'Instant', ...over })
  const bolt = mtg('Lightning Bolt')
  const negate = mtg('Negate')
  const solRing = mtg('Sol Ring', { category: 'Artifact' })
  const forest = mtg('Forest', { category: 'Land', subtypes: ['Basic'] })
  const delver = mtg('Delver of Secrets // Insectile Aberration', { category: 'Creature' })
  const fireIce = mtg('Fire // Ice')
  const vial = mtg('Aether Vial', { category: 'Artifact' })
  const erase = mtg("Erase (Not the Urza's Legacy One)")
  const atraxa = mtg("Atraxa, Praetors' Voice", { category: 'Creature', subtypes: ['Legendary'] })
  const catalog = catalogOf([bolt, negate, solRing, forest, delver, fireIce, vial, erase, atraxa])
  const q = (card: { id: string }, quantity: number) => ({ cardId: card.id, quantity })

  it('reads an Arena export: headings without colons, and set/collector numbers after each name', () => {
    const text = 'Deck\n4 Lightning Bolt (2XM) 141\n1 Sol Ring (C21) 263\n\nSideboard\n2 Negate (MH2) 267'
    const parsed = parseDecklistText(text, mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(bolt, 4), q(solRing, 1)])
    expect(parsed.zones.sideboard).toEqual([q(negate, 2)])
    expect(parsed.unmatched).toEqual([])
  })

  it('reads an MTGO list, where the sideboard is just the block after a blank line', () => {
    const parsed = parseDecklistText('4 Lightning Bolt\n20 Forest\n\n3 Negate\n', mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(bolt, 4), q(forest, 20)])
    expect(parsed.zones.sideboard).toEqual([q(negate, 3)])
  })

  it('does not treat blank lines as a sideboard once the list has headings of its own', () => {
    const parsed = parseDecklistText('Deck\n4 Lightning Bolt\n\n1 Sol Ring\n\nSideboard\n2 Negate', mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(bolt, 4), q(solRing, 1)])
    expect(parsed.zones.sideboard).toEqual([q(negate, 2)])
  })

  it('reads "SB:" tagged lines and "1x" quantities', () => {
    const parsed = parseDecklistText('4x Lightning Bolt\nSB: 2 Negate', mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(bolt, 4)])
    expect(parsed.zones.sideboard).toEqual([q(negate, 2)])
  })

  it('strips foil markers, tags and printings when the whole line does not match a card', () => {
    const text = '1 Sol Ring (C21) 263 *F*\n1x Lightning Bolt [Burn]\n1 Negate ^Have,#37d67a^\n1 Forest (PLST) INV-278'
    const parsed = parseDecklistText(text, mtgAdapter, catalog, 'modern')
    expect(parsed.matchedCopies).toBe(4)
    expect(parsed.unmatched).toEqual([])
  })

  it('matches a real card name that itself ends in parentheses', () => {
    const parsed = parseDecklistText("1 Erase (Not the Urza's Legacy One)", mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(erase, 1)])
  })

  it('finds double-faced and split cards by their full name or just the front face', () => {
    const parsed = parseDecklistText('1 Delver of Secrets\n1 Delver of Secrets // Insectile Aberration\n1 Fire // Ice\n1 Fire', mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(delver, 2), q(fireIce, 2)])
  })

  it('accepts the ligature or its spelled-out form', () => {
    const parsed = parseDecklistText('1 Æther Vial\n1 Aether Vial', mtgAdapter, catalog, 'modern')
    expect(parsed.zones.main).toEqual([q(vial, 2)])
  })

  it('reports lines it cannot match', () => {
    const parsed = parseDecklistText('4 Lightning Bolt\n2 Totally Fake Card', mtgAdapter, catalog, 'modern')
    expect(parsed.unmatched).toEqual(['2 Totally Fake Card'])
  })

  it('puts a Commander heading’s card in the commander zone when importing as Commander', () => {
    const text = 'Commander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring\n1 Forest'
    const parsed = parseDecklistText(text, mtgAdapter, catalog, 'commander')
    expect(parsed.zones.commander).toEqual([q(atraxa, 1)])
    expect(parsed.zones.main).toEqual([q(solRing, 1), q(forest, 1)])
  })

  it('leaves a legendary creature in the main deck when nothing says it is the commander', () => {
    const parsed = parseDecklistText("1 Atraxa, Praetors' Voice\n1 Sol Ring", mtgAdapter, catalog, 'commander')
    expect(parsed.zones.commander).toBeUndefined()
    expect(parsed.zones.main).toEqual([q(atraxa, 1), q(solRing, 1)])
  })

  it('knows a Commander heading means a Commander deck, and that other headings say nothing', () => {
    expect(detectFormatFromHeadings("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring", mtgAdapter)).toBe('commander')
    expect(detectFormatFromHeadings('Commander:\n1 Atraxa', mtgAdapter)).toBe('commander')
    expect(detectFormatFromHeadings('Deck\n4 Lightning Bolt\n\nSideboard\n2 Negate', mtgAdapter)).toBeNull()
    expect(detectFormatFromHeadings('4 Lightning Bolt', mtgAdapter)).toBeNull()
    expect(detectFormatFromHeadings('Commander\n1 Atraxa', pokemonAdapter)).toBeNull()
  })

  it('round-trips its own export, Commander included', () => {
    const deck = {
      ...makeDeck('mtg', { commander: [[atraxa, 1]], main: [[solRing, 1], [forest, 30]], sideboard: [] }),
      formatId: 'commander',
    }
    const text = buildExportText(deck, mtgAdapter, 'Commander', catalog)
    const parsed = parseDecklistText(text, mtgAdapter, catalog, 'commander')
    expect(parsed.name).toBe('Test Deck')
    expect(parsed.formatLabel).toBe('Commander')
    expect(parsed.zones.commander).toEqual([q(atraxa, 1)])
    expect(parsed.zones.main).toEqual([q(forest, 30), q(solRing, 1)])
  })

  it('only strips printing suffixes for games that opt in', () => {
    const xerneas = makeCard('pokemon', { name: 'Xerneas', category: 'Pokémon', setCode: 'XY', number: '95' })
    const cyrus = makeCard('pokemon', { name: "Boss's Orders (Cyrus)", category: 'Trainer', setCode: 'BRS', number: '132' })
    const pokemonCatalog = catalogOf([xerneas, cyrus])
    // Magic reads "Name (SET) 123" as a printing of Name…
    expect(parseDecklistText('2 Bolt (2XM) 141', mtgAdapter, catalogOf([mtg('Bolt')])).matchedCopies).toBe(2)
    // …but for Pokémon that shape means nothing, and a name that really ends in parentheses still matches as written.
    expect(parseDecklistText('2 Xerneas (XY) 95', pokemonAdapter, pokemonCatalog).unmatched).toEqual(['2 Xerneas (XY) 95'])
    expect(parseDecklistText("2 Boss's Orders (Cyrus)", pokemonAdapter, pokemonCatalog).zones.main).toEqual([{ cardId: cyrus.id, quantity: 2 }])
  })
})
