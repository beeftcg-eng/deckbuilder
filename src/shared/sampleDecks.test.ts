import { describe, expect, it } from 'vitest'
import { SAMPLE_DECKS } from './sampleDecks'
import { GAME_ADAPTERS } from './games/registry'
import type { GameId } from './types'

describe('SAMPLE_DECKS', () => {
  it('has one per game, each in one of that game’s formats, every card line starting with a count', () => {
    for (const gameId of Object.keys(GAME_ADAPTERS) as GameId[]) {
      const sample = SAMPLE_DECKS[gameId]
      expect(sample, gameId).toBeDefined()
      expect(GAME_ADAPTERS[gameId].defaultFormats.map((f) => f.id)).toContain(sample.formatId)
      const lines = sample.text.split('\n').filter((l) => l.trim() && !/:$/.test(l.trim()) && l.trim() !== 'Deck')
      for (const line of lines) expect(line, `${gameId}: ${line}`).toMatch(/^\d+ \S/)
    }
  })
})
