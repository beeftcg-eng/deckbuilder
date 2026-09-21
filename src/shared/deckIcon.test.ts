import { describe, expect, it } from 'vitest'
import { resolveDeckIcon } from './deckIcon'
import { mtgAdapter } from './games/mtg'
import { onepieceAdapter } from './games/onepiece'
import { riftboundAdapter } from './games/riftbound'
import { pokemonAdapter } from './games/pokemon'
import { catalogOf, makeCard, makeDeck } from './testFixtures'

const forest = makeCard('mtg', { name: 'Forest', category: 'Land', subtypes: ['Basic'] })
const elf = makeCard('mtg', { name: 'Llanowar Elves', category: 'Creature' })
const bolt = makeCard('mtg', { name: 'Bolt', category: 'Instant' })
const legend = makeCard('mtg', { name: 'Atraxa', category: 'Creature', subtypes: ['Legendary'] })
const all = catalogOf([forest, elf, bolt, legend])

describe('resolveDeckIcon', () => {
  it('uses the card you picked, as long as it is still in the deck', () => {
    const deck = { ...makeDeck('mtg', { main: [[elf, 4], [bolt, 4]] }), formatId: 'modern', iconCardId: bolt.id }
    expect(resolveDeckIcon(deck, mtgAdapter, all)).toBe(bolt)
  })

  it('ignores a picked card that has since left the deck, or that is not in the loaded card data', () => {
    const removed = { ...makeDeck('mtg', { main: [[elf, 4]] }), formatId: 'modern', iconCardId: bolt.id }
    expect(resolveDeckIcon(removed, mtgAdapter, all)).toBe(elf)
    const unknown = { ...makeDeck('mtg', { main: [[elf, 4]] }), formatId: 'modern', iconCardId: 'mtg:ghost' }
    expect(resolveDeckIcon(unknown, mtgAdapter, all)).toBe(elf)
  })

  it('defaults to the deck’s Commander / Leader / Legend', () => {
    const commander = { ...makeDeck('mtg', { commander: [[legend, 1]], main: [[elf, 1]] }), formatId: 'commander' }
    expect(resolveDeckIcon(commander, mtgAdapter, all)).toBe(legend)
    const leader = makeCard('onepiece', { name: 'Zoro', category: 'Leader' })
    const character = makeCard('onepiece', { name: 'Luffy', category: 'Character' })
    expect(resolveDeckIcon(makeDeck('onepiece', { leader: [[leader, 1]], main: [[character, 4]] }), onepieceAdapter, catalogOf([leader, character]))).toBe(leader)
    const rift = makeCard('riftbound', { name: 'Vi', category: 'Legend' })
    const unit = makeCard('riftbound', { name: 'Gromp', category: 'Unit' })
    expect(resolveDeckIcon(makeDeck('riftbound', { legend: [[rift, 1]], main: [[unit, 3]] }), riftboundAdapter, catalogOf([rift, unit]))).toBe(rift)
  })

  it('skips basic lands and basic Energy when choosing a default', () => {
    const deck = { ...makeDeck('mtg', { main: [[forest, 24], [elf, 4]] }), formatId: 'modern' }
    expect(resolveDeckIcon(deck, mtgAdapter, all)).toBe(elf)
    const energy = makeCard('pokemon', { name: 'Fire Energy', category: 'Energy', subtypes: ['Basic'] })
    const mon = makeCard('pokemon', { name: 'Charizard', category: 'Pokémon' })
    expect(resolveDeckIcon(makeDeck('pokemon', { main: [[energy, 12], [mon, 3]] }), pokemonAdapter, catalogOf([energy, mon]))).toBe(mon)
  })

  it('falls back to a basic land for a deck made only of them, and to null for an empty or unloaded deck', () => {
    expect(resolveDeckIcon({ ...makeDeck('mtg', { main: [[forest, 24]] }), formatId: 'modern' }, mtgAdapter, all)).toBe(forest)
    expect(resolveDeckIcon({ ...makeDeck('mtg', {}), formatId: 'modern' }, mtgAdapter, all)).toBeNull()
    expect(resolveDeckIcon({ ...makeDeck('mtg', { main: [[elf, 4]] }), formatId: 'modern' }, mtgAdapter, catalogOf([]))).toBeNull()
  })

  it('skips zero-quantity entries', () => {
    const deck = { ...makeDeck('mtg', { main: [[elf, 0], [bolt, 2]] }), formatId: 'modern' }
    expect(resolveDeckIcon(deck, mtgAdapter, all)).toBe(bolt)
  })
})
