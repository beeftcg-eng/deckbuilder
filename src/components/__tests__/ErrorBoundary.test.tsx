// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ErrorBoundary } from '../ErrorBoundary'
import { t } from '../../shared/i18n'

let broken = true
function Flaky() {
  if (broken) throw new Error('bad card data')
  return <p>deck list</p>
}

afterEach(cleanup)

describe('ErrorBoundary', () => {
  it('shows a notice instead of blanking the window, and Try again renders it anew', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    render(
      <ErrorBoundary area="deck">
        <Flaky />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('bad card data')
    expect(screen.getByText(t.crash.title)).toBeTruthy()
    // Logged through console.error, so errorLog.ts keeps it for a bug report.
    expect(quiet.mock.calls.some((args) => String(args[0]).includes('[deck] crashed'))).toBe(true)

    broken = false
    fireEvent.click(screen.getByText(t.crash.retry))
    expect(screen.getByText('deck list')).toBeTruthy()
    quiet.mockRestore()
  })

  it('tries again by itself when what it shows changes (another deck)', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    broken = true
    function Host() {
      const [deck, setDeck] = useState('a')
      return (
        <>
          <button onClick={() => setDeck('b')}>other deck</button>
          <ErrorBoundary area="deck" resetKey={deck}>
            <Flaky />
          </ErrorBoundary>
        </>
      )
    }
    render(<Host />)
    expect(screen.getByRole('alert')).toBeTruthy()
    broken = false
    fireEvent.click(screen.getByText('other deck'))
    expect(screen.getByText('deck list')).toBeTruthy()
    quiet.mockRestore()
  })
})
