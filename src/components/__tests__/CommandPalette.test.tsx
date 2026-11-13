// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Deck } from '../../shared/types'
import { makeCard } from '../../shared/testFixtures'
import { t } from '../../shared/i18n'
import { runCommand, useCommand } from '../../lib/commands'

const { useAppStore } = await import('../../state/useAppStore')
const { CommandPalette } = await import('../CommandPalette')

afterEach(cleanup)

const deck: Deck = { id: 'd1', gameId: 'pokemon', name: 'Crustle Wall', formatId: 'standard', zones: {}, freeTextZones: {}, createdAt: '', updatedAt: '' }
const other: Deck = { ...deck, id: 'd2', gameId: 'onepiece', name: 'Purple Robin' }
const crustle = makeCard('pokemon', { name: 'Crustle', setName: 'Destined Rivals' })

function setup(patch: object = {}) {
  const calls: string[] = []
  useAppStore.setState({
    decks: [deck, other],
    currentGameId: 'pokemon',
    currentDeckId: null,
    deckViewing: false,
    settings: {},
    pawmodoroConfig: { url: '', anonKey: '', email: '', connected: false },
    catalogs: { pokemon: { cards: [crustle], byId: new Map([[crustle.id, crustle]]) } },
    setShowMyDecks: (show: boolean) => calls.push(`myDecks:${show}`),
    openDeck: (id: string) => calls.push(`open:${id}`),
    setGame: (id: string) => calls.push(`game:${id}`),
    ...patch,
  } as never)
  const onClose = vi.fn()
  render(<CommandPalette onClose={onClose} />)
  const input = screen.getByRole('combobox')
  return { calls, onClose, input }
}

describe('the command palette', () => {
  it('finds a panel by its words, ignoring its emoji, and runs it with Enter', () => {
    const { calls, onClose, input } = setup()
    fireEvent.change(input, { target: { value: 'my decks' } })
    expect(screen.getAllByRole('option')[0].textContent).toContain(t.sidebar.myDecks)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onClose).toHaveBeenCalled()
    expect(calls).toEqual(['myDecks:true'])
  })

  it('opens any deck, in any game, and finds a game without its accent', () => {
    const { calls, input } = setup()
    fireEvent.change(input, { target: { value: 'robin' } })
    fireEvent.click(screen.getByText('Purple Robin'))
    expect(calls).toEqual(['open:d2'])
    cleanup()
    const second = setup()
    fireEvent.change(second.input, { target: { value: 'one piece' } })
    expect(screen.getByText(t.palette.openGame('One Piece'))).toBeTruthy()
  })

  it("lists the current game's cards and opens one through its command", () => {
    const { input } = setup()
    const opened: (string | undefined)[] = []
    function Listener() {
      useCommand('card', (id) => opened.push(id))
      return null
    }
    render(<Listener />)
    fireEvent.change(input, { target: { value: 'crust' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const option = screen.getByText('Crustle').closest('[role="option"]')!
    fireEvent.click(option)
    expect(opened).toEqual([crustle.id])
  })

  it("offers the open deck's actions first, and moves with the arrow keys", () => {
    const { input } = setup({ currentDeckId: 'd1', deckViewing: true })
    const options = screen.getAllByRole('option')
    expect(options[0].textContent).toContain(t.deckView.export)
    expect(options[0].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
  })
})

describe('commands', () => {
  it('wait briefly for a listener that mounts after them', () => {
    const got: string[] = []
    runCommand('deck:compare')
    function Late() {
      useCommand('deck:compare', () => got.push('compare'))
      return null
    }
    act(() => {
      render(<Late />)
    })
    expect(got).toEqual(['compare'])
    // Once handled, it doesn't run again for the next listener.
    cleanup()
    render(<Late />)
    expect(got).toEqual(['compare'])
  })
})
