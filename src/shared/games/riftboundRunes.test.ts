import { describe, expect, it } from 'vitest'
import { withMissingRunes, withOriginsRuneArt } from './riftboundRunes'
import { makeCard } from '../testFixtures'

describe('withMissingRunes', () => {
  const venCommon = makeCard('riftbound', { name: 'Fury Rune', sourceId: 'ven-r01', setId: 'VEN', setName: 'Vendetta', category: 'Rune', released: '2026-07-31' })

  it("adds Vendetta's Showcase and promo runes and the R0xc promos", () => {
    const cards = withMissingRunes([venCommon])
    const added = cards.filter((c) => c.id.startsWith('riftbound:tcg-'))
    expect(added).toHaveLength(18)
    const showcase = added.find((c) => c.sourceId === 'ven-r01a')!
    expect(showcase).toMatchObject({ name: 'Fury Rune (Alternate Art)', setName: 'Vendetta', number: '1a', rarity: 'Showcase', category: 'Rune', colors: ['Fury'], released: '2026-07-31', tcgplayerId: '709312' })
    expect(added.find((c) => c.sourceId === 'ven-r02b')).toMatchObject({ name: 'Calm Rune', rarity: 'Promo', imageUrl: expect.stringMatching(/opp-r02b\.png$/) })
    expect(added.find((c) => c.sourceId === 'opp-r06c')).toMatchObject({ name: 'Order Rune', setId: 'OPP', imageUrl: null })
  })

  it('keeps its own card when riftcodex adds the same printing, borrowing the picture', () => {
    const theirs = makeCard('riftbound', { id: 'riftbound:abc', name: 'Fury Rune', tcgplayerId: '709312', imageUrl: 'https://x/r01a.png', imageUrlSmall: 'https://x/r01a.png' })
    const cards = withMissingRunes([venCommon, theirs])
    expect(cards.some((c) => c.id === 'riftbound:abc')).toBe(false)
    expect(cards.find((c) => c.id === 'riftbound:tcg-709312')!.imageUrl).toBe('https://x/r01a.png')
  })
})

describe('withOriginsRuneArt', () => {
  it("shows the Origins rune's art on its Organized Play promo, not Vendetta's", () => {
    const origins = makeCard('riftbound', { name: 'Calm Rune', sourceId: 'ogn-042-298', category: 'Rune', imageUrl: 'https://x/ogn042.png', imageUrlSmall: 'https://x/ogn042.png' })
    const promo = makeCard('riftbound', { name: 'Calm Rune', sourceId: 'opp-042b-298', category: 'Rune', imageUrl: 'https://x/venr02.png' })
    const other = makeCard('riftbound', { name: 'Jinx', sourceId: 'opp-251-298', imageUrl: 'https://x/jinx.png' })
    const [, fixed, untouched] = withOriginsRuneArt([origins, promo, other])
    expect(fixed.imageUrl).toBe('https://x/ogn042.png')
    expect(untouched).toBe(other)
  })
})
