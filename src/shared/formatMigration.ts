import type { Format, GameId } from './types'
import { ROTATED_OUT_SET_IDS, onepieceAdapter } from './games/onepiece'

/**
 * One Piece Standard's legal sets as shipped before it listed the rotated-out ones instead
 * (Format.illegalSetIds). Only for working out what a saved list meant: a set not on this list or
 * ROTATED_OUT_SET_IDS came out after it, so it counts as legal now.
 */
const OLD_ONE_PIECE_LEGAL_SETS = [
  'EB-01', 'EB-02', 'EB-03', 'OP-05', 'OP-06', 'OP-07', 'OP-08', 'OP-09', 'OP-10', 'OP-11', 'OP-12', 'OP-13', 'OP-16', 'OP-17',
  'OP14-EB04', 'OP15-EB04', 'PRB-01', 'PRB-02', 'ST-10', 'ST-11', 'ST-12', 'ST-13', 'ST-14', 'ST-15', 'ST-16', 'ST-17', 'ST-18',
  'ST-19', 'ST-20', 'ST-21', 'ST-22', 'ST-23', 'ST-24', 'ST-25', 'ST-26', 'ST-27', 'ST-28', 'ST-30', 'ST-31', 'ST-32', 'ST-33',
  'ST-34', 'ST-35', 'ST-36',
]

const OLD_ONE_PIECE_DESCRIPTION =
  'Block 2 onward (OP-05 and later) as of the April 2026 rotation, which retired Block 1 (OP-01–OP-04 and starter decks ST-01–ST-09). Also applies the current official banned/restricted list as a snapshot from onepiece.gg. Bandai rotates the legal block window each April 1st (next: April 2027) — re-check onepiece.gg periodically, neither list is auto-updated.'

/**
 * Saved One Piece Standard formats list their legal sets, so every set released since reads as illegal.
 * This turns that into the rotated-out list: each set the old list knew keeps whatever the user had it
 * set to, and every newer set is legal. Returns null when nothing needed changing.
 */
export function migrateFormats(gameId: GameId, formats: Format[]): Format[] | null {
  if (gameId !== 'onepiece') return null
  let changed = false
  const migrated = formats.map((format) => {
    if (format.id !== 'standard' || !format.legalSetIds || format.illegalSetIds) return format
    changed = true
    const { legalSetIds, ...rest } = format
    const known = [...new Set([...ROTATED_OUT_SET_IDS, ...OLD_ONE_PIECE_LEGAL_SETS])]
    const description = format.description === OLD_ONE_PIECE_DESCRIPTION ? onepieceAdapter.defaultFormats.find((f) => f.id === 'standard')?.description : format.description
    return { ...rest, ...(description !== undefined ? { description } : {}), illegalSetIds: known.filter((id) => !legalSetIds.includes(id)) }
  })
  return changed ? migrated : null
}

