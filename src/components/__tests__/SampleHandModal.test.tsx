// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SampleHandModal } from '../SampleHandModal'
import { makeCard, makeDeck } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Practice', () => {
  it('plays One Piece cards from the turn’s DON!! and dims what it can’t afford', () => {
    const cheap = makeCard('onepiece', { name: 'Cheap', category: 'Character', cost: '1' })
    const dear = makeCard('onepiece', { name: 'Dear', category: 'Character', cost: '5' })
    // No shuffling: the hand is the first five, 3 Dear and 2 Cheap.
    vi.spyOn(Math, 'random').mockReturnValue(0.99999)
    const deck = makeDeck('onepiece', { main: [[dear, 3], [cheap, 37]] })
    render(<SampleHandModal deck={deck} cardsById={new Map([cheap, dear].map((c) => [c.id, c]))} handSize={5} onClose={() => {}} />)
    // Turn 1, going first: 1 DON!!.
    fireEvent.click(screen.getByText(t.sampleHand.nextTurn))
    expect(screen.getByRole('status').textContent).toBe(t.sampleHand.resourcesLeft('onepiece', 1, 1))
    const dearCard = screen.getAllByTitle(t.sampleHand.playTitle('Dear', 5))[0]
    expect(dearCard.className).toContain('unaffordable')
    fireEvent.click(screen.getAllByTitle(t.sampleHand.playTitle('Cheap', 1))[0])
    expect(screen.getByRole('status').textContent).toBe(t.sampleHand.resourcesLeft('onepiece', 0, 1))
    expect(screen.getByText(t.sampleHand.inPlay(1))).toBeTruthy()
    // Taking it back refunds it; the next turn brings 3.
    fireEvent.click(screen.getByTitle(t.sampleHand.unplayTitle('Cheap')))
    fireEvent.click(screen.getByText(t.sampleHand.nextTurn))
    expect(screen.getByRole('status').textContent).toBe(t.sampleHand.resourcesLeft('onepiece', 3, 3))
  })
})
