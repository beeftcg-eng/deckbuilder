// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { makeCard, makeDeck } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

;(window as unknown as { api: object }).api = { fetchCommunityPage: vi.fn(async () => Promise.reject(new Error('offline'))) }
vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

const { useAppStore } = await import('../../state/useAppStore')
const { RiftboundGame } = await import('../practice/RiftboundGame')

afterEach(cleanup)

const legend = makeCard('riftbound', { name: 'Kennen - Heart of the Tempest', category: 'Legend', colors: ['Fury'] })
const grunt = makeCard('riftbound', { name: 'Grunt', category: 'Unit', cost: '1', might: 2, colors: ['Fury'] })
const fields = ['Altar', 'Bridge', 'Cave'].map((name) => makeCard('riftbound', { name, category: 'Battlefield' }))
const cards = [legend, grunt, ...fields]
const deck = makeDeck('riftbound', { legend: [[legend, 1]], main: [[grunt, 40]], battlefields: fields.map((f): [typeof f, number] => [f, 1]) }, { runes: [{ label: 'Fury', quantity: 12 }] })

describe('a Riftbound practice game', () => {
  it('plays alone: keep, play a unit, move it to a battlefield for a point, end the turn', async () => {
    useAppStore.setState({ catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } }, settings: {} } as never)
    render(<RiftboundGame deck={deck} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(t.practiceGame.rules), { target: { value: 'auto' } })
    fireEvent.click(screen.getByText(t.practiceGame.start))
    fireEvent.click(screen.getByText(t.practiceGame.keep))
    expect(screen.getAllByText(t.practiceGame.yourTurn(1)).length).toBeGreaterThan(0)

    // Play a Grunt from hand (1 Energy of 2 runes).
    fireEvent.click(within(screen.getByLabelText(t.practiceGame.hand)).getAllByRole('button')[0])
    fireEvent.click(screen.getByText(t.practiceGame.play(1, 0)))
    const base = screen.getByLabelText(t.practiceGame.yourBase)
    expect(within(base).getAllByRole('button', { name: /^Grunt/ }).length).toBeGreaterThan(0)

    // It entered exhausted; next turn it can move and conquer.
    fireEvent.click(screen.getByText(t.practiceGame.endTurn))
    expect(screen.getAllByText(t.practiceGame.yourTurn(2)).length).toBeGreaterThan(0)
    fireEvent.click(within(screen.getByLabelText(t.practiceGame.yourBase)).getAllByRole('button', { name: /^Grunt/ })[0])
    fireEvent.click(screen.getAllByText(t.practiceGame.moveHere(1))[0])
    expect(screen.getByText(t.practiceGame.points(1))).toBeTruthy()

    // Undo puts it back.
    fireEvent.click(screen.getByText(t.practiceGame.undo))
    expect(screen.getByText(t.practiceGame.points(0))).toBeTruthy()
  })

  it('by hand: start of turn, move with no fight or point, then set control and add the point yourself', () => {
    useAppStore.setState({ catalogs: { riftbound: { cards, byId: new Map(cards.map((c) => [c.id, c])) } }, settings: {} } as never)
    render(<RiftboundGame deck={deck} onClose={() => {}} />)
    fireEvent.click(screen.getByText(t.practiceGame.start)) // By hand is the default
    fireEvent.click(screen.getByText(t.practiceGame.keep))
    // Nothing was channelled for you: start of turn does it.
    expect(screen.getByLabelText(t.practiceGame.runesLabel(0, 0))).toBeTruthy()
    fireEvent.click(screen.getByText(t.practiceGame.startOfTurn))
    expect(screen.getByLabelText(t.practiceGame.runesLabel(2, 2))).toBeTruthy()
    fireEvent.click(within(screen.getByLabelText(t.practiceGame.hand)).getAllByRole('button')[0])
    fireEvent.click(screen.getByText(t.practiceGame.play(1, 0)))
    // Exhausted or not, your unit goes where you say, and nothing is scored.
    fireEvent.click(within(screen.getByLabelText(t.practiceGame.yourBase)).getAllByRole('button', { name: /^Grunt/ })[0])
    fireEvent.click(screen.getAllByText(t.practiceGame.moveHere(1))[0])
    expect(screen.getByText(t.practiceGame.points(0))).toBeTruthy()
    fireEvent.change(screen.getAllByLabelText(/Who holds/)[0], { target: { value: '0' } })
    fireEvent.click(screen.getByLabelText(t.practiceGame.pointPlus))
    expect(screen.getByText(t.practiceGame.points(1))).toBeTruthy()
  })
})
