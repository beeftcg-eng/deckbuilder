// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Deck } from '../../shared/types'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'
import { normalizeSharedDeck } from '../../shared/deckShare'

const saved: Deck[] = []
;(window as unknown as { api: object }).api = { decks: { save: vi.fn(async (deck: Deck) => (saved.push(deck), deck)) } }
const { useAppStore } = await import('../../state/useAppStore')
const { MatchupPlans } = await import('../MatchupPlans')

afterEach(cleanup)

describe('Sideboard plans', () => {
  it('plans what comes in and out against an opponent, and keeps it off share links', async () => {
    const bolt = makeCard('mtg', { name: 'Lightning Bolt' })
    const blast = makeCard('mtg', { name: 'Pyroblast' })
    const cardsById = new Map([bolt, blast].map((c) => [c.id, c]))
    const deck: Deck = {
      id: 'd', gameId: 'mtg', name: 'Burn', formatId: 'modern', freeTextZones: {}, createdAt: '', updatedAt: '',
      zones: { main: [{ cardId: bolt.id, quantity: 4 }], sideboard: [{ cardId: blast.id, quantity: 3 }] },
    }
    useAppStore.setState({ decks: [deck], pairingsRecords: { d: [{ event: '', date: '', game: '', format: '', store: '', placement: '', record: '', inProgress: false, deckVersion: null, matches: [{ opponent: 'Murktide', outcome: 'L', wentFirst: '' }] }] } } as never)
    const { rerender } = render(<MatchupPlans deck={deck} cardsById={cardsById} />)
    fireEvent.click(screen.getByText(t.matchupPlans.title))
    fireEvent.click(screen.getByText(t.matchupPlans.add))
    expect(document.querySelector('#matchup-opponents option')?.getAttribute('value')).toBe('Murktide')
    fireEvent.change(screen.getByPlaceholderText(t.matchupPlans.opponentPlaceholder), { target: { value: 'Murktide' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Pyroblast' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Pyroblast' }))
    expect(screen.getByText(t.matchupPlans.unbalanced(2, 0))).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ Lightning Bolt' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Lightning Bolt' }))
    expect(screen.queryByText(t.matchupPlans.unbalanced(2, 2))).toBeNull()
    fireEvent.click(screen.getByText(t.matchupPlans.save))
    await vi.waitFor(() => expect(saved.at(-1)?.matchupPlans).toHaveLength(1))
    const plan = saved.at(-1)!.matchupPlans![0]
    expect(plan).toMatchObject({ opponent: 'Murktide', in: [{ cardId: blast.id, quantity: 2 }], out: [{ cardId: bolt.id, quantity: 2 }] })

    rerender(<MatchupPlans deck={saved.at(-1)!} cardsById={cardsById} />)
    expect(screen.getByText(t.matchupPlans.vs('Murktide'))).toBeTruthy()
    expect(screen.getByText('2 Pyroblast')).toBeTruthy()

    const shared = normalizeSharedDeck({ game_id: 'mtg', data: saved.at(-1) })
    expect(shared?.deck).not.toHaveProperty('matchupPlans')
  })
})
