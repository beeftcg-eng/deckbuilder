import { describe, expect, it } from 'vitest'
import { normalizeAnnouncement } from './announcement'

describe('normalizeAnnouncement', () => {
  const now = new Date('2026-10-10T12:00:00Z')

  it('reads a full announcement', () => {
    expect(normalizeAnnouncement({ id: ' a1 ', title: 'Hi', message: ' Hello\nthere ', link: 'https://example.com', linkLabel: ' Donate ' }, now)).toEqual({
      id: 'a1',
      title: 'Hi',
      message: 'Hello\nthere',
      link: 'https://example.com',
      linkLabel: 'Donate',
    })
  })

  it('sends nothing without an id or a message', () => {
    expect(normalizeAnnouncement({ id: 'a1', message: '' }, now)).toBeNull()
    expect(normalizeAnnouncement({ id: '', message: 'Hello' }, now)).toBeNull()
    expect(normalizeAnnouncement(null, now)).toBeNull()
  })

  it('stops on its until date', () => {
    expect(normalizeAnnouncement({ id: 'a1', message: 'Hello', until: '2026-10-11' }, now)).not.toBeNull()
    expect(normalizeAnnouncement({ id: 'a1', message: 'Hello', until: '2026-10-10' }, now)).toBeNull()
  })

  it('drops links that are not https', () => {
    expect(normalizeAnnouncement({ id: 'a1', message: 'Hello', link: 'javascript:alert(1)' }, now)?.link).toBeNull()
  })
})
