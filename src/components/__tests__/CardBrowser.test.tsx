// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeCard, makeDeck } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

/**
 * The card browser stays mounted beside the collection, so what it filtered by while building a deck
 * (the Legend's colours, a search) mustn't follow you into the collection.
 */
;(window as unknown as { api: object }).api = {}

const { useAppStore } = await import('../../state/useAppStore')
const { CardBrowser } = await import('../CardBrowser')

const legend = makeCard('riftbound', { name: 'Jinx, Loose Cannon', category: 'Legend', colors: ['Fury', 'Chaos'] })
const champion = makeCard('riftbound', { name: 'Jinx, Rebel', subtypes: ['Champion'], colors: ['Fury'] })
const furyUnit = makeCard('riftbound', { name: 'Blazing Scorcher', colors: ['Fury'] })
const calmUnit = makeCard('riftbound', { name: 'Leafling Monk', colors: ['Calm'] })
const cards = [legend, champion, furyUnit, calmUnit]

beforeEach(() => {
  const deck = makeDeck('riftbound', { legend: [[legend, 1]], main: [[champion, 1]] })
  useAppStore.setState({
    currentGameId: 'riftbound',
    catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } },
    decks: [deck],
    currentDeckId: deck.id,
    showCollection: false,
    collection: {},
  })
})
afterEach(cleanup)

const shown = (name: string) => screen.queryAllByText(name).length > 0

describe('Card browser', () => {
  it("drops the deck's filters in the collection, and puts the Legend's colours back on return", () => {
    render(<CardBrowser />)
    expect(shown('Blazing Scorcher')).toBe(true)
    expect(shown('Leafling Monk')).toBe(false) // outside Jinx's colours

    fireEvent.change(screen.getByPlaceholderText(t.browser.search('Riftbound')), { target: { value: 'blazing' } })
    act(() => useAppStore.setState({ showCollection: true }))
    expect((screen.getByPlaceholderText(t.browser.search('Riftbound')) as HTMLInputElement).value).toBe('')
    expect(shown('Blazing Scorcher')).toBe(true)
    expect(shown('Leafling Monk')).toBe(true)

    act(() => useAppStore.setState({ showCollection: false }))
    expect(shown('Blazing Scorcher')).toBe(true)
    expect(shown('Leafling Monk')).toBe(false)
  })
})
