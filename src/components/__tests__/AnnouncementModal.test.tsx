// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { t } from '../../shared/i18n'

/** A message to all users shows until it's dismissed, and its id is saved so it never shows again on this device. */
const saved: object[] = []
;(window as unknown as { api: object }).api = {
  settings: { set: vi.fn(async (patch: object) => (saved.push(patch), patch)) },
}

const { useAppStore } = await import('../../state/useAppStore')
const { AnnouncementModal } = await import('../AnnouncementModal')

afterEach(cleanup)

describe('AnnouncementModal', () => {
  it('shows the message and remembers it once dismissed', () => {
    render(<AnnouncementModal />)
    expect(document.querySelector('.announcement-modal')).toBeNull()

    act(() => useAppStore.setState({ announcement: { id: 'a1', title: 'Heads up', message: 'Hello everyone', link: null } }))
    expect(screen.getByText('Heads up')).toBeTruthy()
    expect(screen.getByText('Hello everyone')).toBeTruthy()

    fireEvent.click(screen.getByText(t.announcement.ok))
    expect(document.querySelector('.announcement-modal')).toBeNull()
    expect(useAppStore.getState().settings.announcementSeen).toBe('a1')
    expect(saved).toContainEqual({ announcementSeen: 'a1' })
  })
})
