import { describe, expect, it } from 'vitest'
import { kindOptions, matchesKinds, matchesTypes, typeOptions } from './cardFilters'
import { makeCard } from './testFixtures'

const set = (...xs: string[]) => new Set(xs)

describe('type and kind filters', () => {
  const ygoLink = makeCard('yugioh', { name: 'Accesscode Talker', category: 'Monster', subtypes: ['Cyberse', 'Link', 'Effect', 'Extra Deck'] })
  const ygoXyz = makeCard('yugioh', { name: 'Number 39: Utopia', category: 'Monster', subtypes: ['Warrior', 'Xyz', 'Effect', 'Extra Deck'] })
  const ygoSpell = makeCard('yugioh', { name: 'Pot of Prosperity', category: 'Spell', subtypes: ['Normal'] })
  const ygoTrap = makeCard('yugioh', { name: 'Infinite Impermanence', category: 'Trap', subtypes: ['Normal'] })
  const ygo = [ygoLink, ygoXyz, ygoSpell, ygoTrap]

  it('filters Yu-Gi-Oh by Monster / Spell / Trap, and by Link / Xyz', () => {
    expect(ygo.filter((c) => matchesTypes(c, set('Spell', 'Trap'))).map((c) => c.name)).toEqual(['Pot of Prosperity', 'Infinite Impermanence'])
    expect(ygo.filter((c) => matchesKinds(c, set('Link', 'Xyz'))).map((c) => c.name)).toEqual(['Accesscode Talker', 'Number 39: Utopia'])
    expect(ygo.filter((c) => matchesTypes(c, set('Monster')) && matchesKinds(c, set('Link'))).map((c) => c.name)).toEqual(['Accesscode Talker'])
  })

  it('finds a Magic enchantment creature under both Creature and Enchantment', () => {
    const eidolon = makeCard('mtg', { name: 'Eidolon of Blossoms', category: 'Creature', subtypes: ['Enchantment', 'Spirit'] })
    const bolt = makeCard('mtg', { name: 'Lightning Bolt', category: 'Instant', subtypes: [] })
    expect(matchesTypes(eidolon, set('Enchantment'))).toBe(true)
    expect(matchesTypes(eidolon, set('Creature'))).toBe(true)
    expect(matchesTypes(bolt, set('Enchantment'))).toBe(false)
    expect(matchesTypes(bolt, set())).toBe(true)
  })

  it('filters Pokémon by stage and trainer kind', () => {
    const pika = makeCard('pokemon', { name: 'Pikachu', category: 'Pokémon', subtypes: ['Basic'] })
    const raichu = makeCard('pokemon', { name: 'Raichu', category: 'Pokémon', subtypes: ['Stage 1'] })
    const iono = makeCard('pokemon', { name: 'Iono', category: 'Trainer', subtypes: ['Supporter'] })
    const ball = makeCard('pokemon', { name: 'Ultra Ball', category: 'Trainer', subtypes: ['Item'] })
    const cards = [pika, raichu, iono, ball]
    expect(cards.filter((c) => matchesKinds(c, set('Item'))).map((c) => c.name)).toEqual(['Ultra Ball'])
    expect(cards.filter((c) => matchesTypes(c, set('Pokémon')) && matchesKinds(c, set('Stage 1'))).map((c) => c.name)).toEqual(['Raichu'])
  })

  it('offers types in the game order and only kinds some card has', () => {
    expect(typeOptions([ygoTrap, ygoSpell, ygoLink], ['Monster', 'Spell', 'Trap'])).toEqual(['Monster', 'Spell', 'Trap'])
    expect(kindOptions(ygo, ['Fusion', 'Xyz', 'Link'])).toEqual(['Xyz', 'Link'])
    expect(kindOptions(ygo, [])).toEqual([])
  })
})
