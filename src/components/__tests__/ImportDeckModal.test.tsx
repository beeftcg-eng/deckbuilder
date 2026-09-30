// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Deck } from '../../shared/types'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

const archidekt = {
  name: 'Bolt Tribal',
  categories: [{ name: 'Removal', includedInDeck: true }],
  cards: [{ quantity: 4, categories: ['Removal'], card: { uid: 'bolt-2xm', oracleCard: { name: 'Lightning Bolt' } } }],
}
const saved: Deck[] = []
const api = {
  fetchDeckPage: vi.fn(async () => JSON.stringify(archidekt)),
  decks: { save: vi.fn(async (deck: Deck) => (saved.push(deck), deck)) },
  settings: { set: vi.fn(async () => ({})) },
}
;(window as unknown as { api: typeof api }).api = api

const { useAppStore } = await import('../../state/useAppStore')
const { ImportDeckModal } = await import('../ImportDeckModal')

const regular = makeCard('mtg', { id: 'mtg:oracle-bolt', sourceId: 'oracle-bolt', name: 'Lightning Bolt', imageUrl: 'https://img/oracle-bolt.jpg' })
const doubleMasters = makeCard('mtg', { id: 'mtg:bolt-2xm', sourceId: 'oracle-bolt', name: 'Lightning Bolt', setId: '2xm', imageUrl: 'https://img/bolt-2xm.jpg' })

afterEach(cleanup)

describe('Import deck from a link', () => {
  it('gets the list from the link, then imports the exact printings with the tags', async () => {
    useAppStore.setState({ catalogs: { mtg: { cards: [regular, doubleMasters], byId: new Map([regular, doubleMasters].map((c) => [c.id, c])) } }, formats: {} })
    render(<ImportDeckModal gameId="mtg" onClose={() => {}} />)
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'https://archidekt.com/decks/42/bolt_tribal' } })
    fireEvent.click(screen.getByText(t.importDeck.fetchLink))

    await waitFor(() => expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Main Deck\n4 Lightning Bolt'))
    expect(api.fetchDeckPage).toHaveBeenCalledWith('https://archidekt.com/decks/42/bolt_tribal')
    expect((screen.getByPlaceholderText(t.importDeck.deckName) as HTMLInputElement).value).toBe('Bolt Tribal')

    fireEvent.click(screen.getByText(t.importDeck.import))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].zones.main).toEqual([{ cardId: 'mtg:bolt-2xm', quantity: 4 }])
    expect(Object.values(saved[0].tags ?? {})).toEqual([['Removal']])
  })

  it("says so when a link is for another game's deck", () => {
    const pikachu = makeCard('pokemon', { name: 'Pikachu' })
    useAppStore.setState({ catalogs: { pokemon: { cards: [pikachu], byId: new Map([[pikachu.id, pikachu]]) } } })
    render(<ImportDeckModal gameId="pokemon" onClose={() => {}} />)
    fireEvent.change(document.querySelector('textarea')!, { target: { value: 'https://archidekt.com/decks/42' } })
    expect(screen.getByText(t.importDeck.linkOtherGame('Magic'))).toBeTruthy()
  })
})
