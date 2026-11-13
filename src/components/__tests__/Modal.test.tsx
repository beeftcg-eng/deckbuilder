// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from '../Modal'

afterEach(cleanup)

function Page({ onOuterClose = () => {}, onInnerClose = () => {} }: { onOuterClose?: () => void; onInnerClose?: () => void }) {
  const [open, setOpen] = useState(false)
  const [inner, setInner] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal
          label="Outer"
          onClose={() => {
            onOuterClose()
            setOpen(false)
          }}
        >
          <input aria-label="Name" />
          <button onClick={() => setInner(true)}>More</button>
          <button>Last</button>
          {inner && (
            <Modal
              label="Inner"
              onClose={() => {
                onInnerClose()
                setInner(false)
              }}
            >
              <button>Inner button</button>
            </Modal>
          )}
        </Modal>
      )}
    </>
  )
}

const tab = (shift = false) => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: shift })

describe('a window (Modal)', () => {
  it('is a named dialog that takes focus, to its first field', () => {
    render(<Page />)
    const opener = screen.getByText('Open')
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Outer' }).getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
  })

  it('keeps Tab inside, both ways', () => {
    render(<Page />)
    fireEvent.click(screen.getByText('Open'))
    screen.getByText('Last').focus()
    tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
    tab(true)
    expect(document.activeElement).toBe(screen.getByText('Last'))
  })

  it('closes the top window with Esc, then the next, and puts focus back each time', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(<Page onOuterClose={outer} onInnerClose={inner} />)
    const opener = screen.getByText('Open')
    opener.focus()
    fireEvent.click(opener)
    const more = screen.getByText('More')
    more.focus()
    fireEvent.click(more)
    expect(document.activeElement).toBe(screen.getByText('Inner button'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(more)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(outer).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes when the backdrop is clicked, not the window', () => {
    const outer = vi.fn()
    render(<Page onOuterClose={outer} />)
    fireEvent.click(screen.getByText('Open'))
    fireEvent.click(screen.getByRole('dialog', { name: 'Outer' }))
    expect(outer).not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('.modal-overlay')!)
    expect(outer).toHaveBeenCalledTimes(1)
  })
})
