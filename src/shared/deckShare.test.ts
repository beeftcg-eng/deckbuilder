import { describe, expect, it } from 'vitest'
import { isNotSyncedError, normalizeSharedDeck, parseShareToken, shareUrl } from './deckShare'

describe('share links', () => {
  it('builds and reads back a link', () => {
    const url = shareUrl('0123456789abcdef')
    expect(url).toBe('https://beeftcg-eng.github.io/deckbuilder/?share=0123456789abcdef')
    expect(parseShareToken(url)).toBe('0123456789abcdef')
  })

  it('finds the token in pasted text, or a bare token', () => {
    expect(parseShareToken('  0123456789abcdef \n')).toBe('0123456789abcdef')
    expect(parseShareToken('look at this https://beeftcg-eng.github.io/deckbuilder/?x=1&share=fedcba9876543210 !')).toBe('fedcba9876543210')
  })

  it('ignores decklists and malformed tokens', () => {
    expect(parseShareToken('4 Lightning Bolt\n20 Mountain')).toBeNull()
    expect(parseShareToken('?share=XYZ')).toBeNull()
    expect(parseShareToken('?share=0123456789abcdef0')).toBeNull() // 17 characters
    expect(parseShareToken('')).toBeNull()
  })

  it('recognises the not-uploaded-yet error', () => {
    expect(isNotSyncedError(new Error('400: {"message":"deck not synced"}'))).toBe(true)
    expect(isNotSyncedError(new Error('500: boom'))).toBe(false)
  })
})

describe('normalizeSharedDeck', () => {
  const row = {
    game_id: 'riftbound',
    updated_at: '2026-09-28T10:00:00Z',
    owner_name: 'Beef',
    data: {
      id: 'd1',
      name: 'Vi Aggro',
      formatId: 'constructed',
      zones: { main: [{ cardId: 'a', quantity: 3 }, { cardId: 'b', quantity: 0 }, { cardId: 5, quantity: 1 }, null], legend: 'nope' },
      freeTextZones: { runes: [{ label: 'Fury', quantity: 6 }, { label: 'Calm' }] },
      notes: 'Mulligan hands without a 2-drop',
    },
  }

  it('keeps a valid deck and drops malformed entries', () => {
    const shared = normalizeSharedDeck(row)!
    expect(shared.ownerName).toBe('Beef')
    expect(shared.deck.gameId).toBe('riftbound')
    expect(shared.deck.name).toBe('Vi Aggro')
    expect(shared.deck.zones).toEqual({ main: [{ cardId: 'a', quantity: 3 }], legend: [] })
    expect(shared.deck.freeTextZones).toEqual({ runes: [{ label: 'Fury', quantity: 6 }] })
    expect(shared.deck.shareToken).toBeUndefined()
    expect(shared.deck.notes).toBeUndefined()
    expect(shared.deck.locked).toBeUndefined()
  })

  it('treats a dead link or an unknown game as nothing to show', () => {
    expect(normalizeSharedDeck(null)).toBeNull()
    expect(normalizeSharedDeck({ ...row, game_id: 'chess' })).toBeNull()
    expect(normalizeSharedDeck({ ...row, data: null })).toBeNull()
  })

  it('fills in a missing name and owner', () => {
    const shared = normalizeSharedDeck({ ...row, owner_name: '  ', data: { ...row.data, name: '' } })!
    expect(shared.deck.name).toBe('Shared deck')
    expect(shared.ownerName).toBeNull()
  })
})
