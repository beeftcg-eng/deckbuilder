#!/usr/bin/env node
/**
 * Refreshes public/card-data/riftbound.json - the copy of the Riftbound card list the app falls back to when
 * riftcodex is down (src/shared/games/riftbound.ts, BACKUP_URL) - from this computer's desktop card cache.
 * Sync Riftbound in the desktop app first, then: node scripts/update-card-backup.mjs [path/to/riftbound.json]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const source = process.argv[2] ?? join(homedir(), '.config', 'deckbuilder', 'cards', 'riftbound.json')
const cache = JSON.parse(readFileSync(source, 'utf8'))
if (!Array.isArray(cache.cards) || cache.cards.length < 500) throw new Error(`${source} has ${cache.cards?.length ?? 0} cards - sync Riftbound first`)
if (cache.cards.some((card) => card.gameId !== 'riftbound')) throw new Error(`${source} isn't a Riftbound card cache`)

mkdirSync('public/card-data', { recursive: true })
writeFileSync('public/card-data/riftbound.json', JSON.stringify({ builtAt: cache.lastSynced, cards: cache.cards }))
console.log(`public/card-data/riftbound.json: ${cache.cards.length} cards, synced ${cache.lastSynced}`)
