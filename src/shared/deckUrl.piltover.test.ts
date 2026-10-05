import { describe, expect, it } from 'vitest'
import { deckUrlTarget, fromPiltoverArchive } from './deckUrl'
import { makeCard } from './testFixtures'

/** A Piltover Archive page the way Next.js streams it: the deck's data split over push() chunks. */
function page(data: object): string {
  const json = JSON.stringify(data)
  const half = Math.floor(json.length / 2)
  return [json.slice(0, half), json.slice(half)].map((part) => `<script>self.__next_f.push([1,${JSON.stringify(part)}])</script>`).join('')
}

const entry = (name: string, quantity: number, tcgplayerId: number | null) => ({
  deckId: 'd',
  variantId: `v-${name}`,
  quantity,
  card: { name, cardVariants: [{ id: `v-${name}`, tcgplayerId }] },
})

describe('Piltover Archive', () => {
  it('recognises deck links', () => {
    expect(deckUrlTarget('https://piltoverarchive.com/decks/view/b08cdd76-f163-4949-8f12-6a37a27cc811')).toMatchObject({ site: 'piltover', gameId: 'riftbound' })
    expect(deckUrlTarget('https://piltoverarchive.com/decks')).toBeNull()
  })

  it('reads every zone, naming the exact printings the catalog has', () => {
    const altArt = makeCard('riftbound', { name: 'Teemo - Strategist (Alternate Art)', sourceId: 'ogn-262a-298', tcgplayerId: '700' })
    const html = page({
      name: 'Teemo \"Top 8\"',
      description: null,
      legend: { id: 'v-legend', card: { name: 'Teemo, Swift Scout', cardVariants: [{ id: 'v-legend', tcgplayerId: null }] } },
      champions: [entry('Teemo, Strategist', 3, 700)],
      battlefields: [entry('Bandle Tree', 1, null)],
      runes: [entry('Mind Rune', 7, 1), entry('Chaos Rune', 5, 2)],
      maindeck: [entry('Gust', 3, null)],
      sideboard: [entry('Retreat', 2, null)],
    })
    const deck = fromPiltoverArchive(html, new Map([[altArt.id, altArt]]))
    expect(deck.name).toBe('Teemo "Top 8"')
    expect(deck.text).toBe(
      [
        'Legend:\n1 Teemo, Swift Scout',
        'MainDeck:\n3 ogn-262a-298 Teemo, Strategist\n3 Gust',
        'Battlefields:\n1 Bandle Tree',
        'Runes:\n7 Mind Rune\n5 Chaos Rune',
        'Sideboard:\n2 Retreat',
      ].join('\n\n'),
    )
  })
})
