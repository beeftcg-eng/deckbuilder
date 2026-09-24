import type { Card } from '../types'

/**
 * The set every One Piece promo goes in. /allPromos/ reports each promo's set_id as the set its card number comes
 * from ("OP09" for a promo reprint of OP09-077, "P" for P-084), but a printing belongs to the set it was printed in -
 * that's how every other reprint here is filed (an OP01 number reprinted in OP-05 has setId "OP-05") - so they all
 * share one set.
 */
export const PROMO_SET_ID = 'P'

/** Card numbers from the Block 1 sets (OP-01–OP-04, ST-01–ST-09). */
const BLOCK_ONE_NUMBER = /^(?:OP0[1-4]|ST0[1-9])-/

/**
 * Whether a promo carries the Block 1 icon, from its card number. The card data has no block field, so this is
 * worked out from Bandai's own card list (en.onepiece-cardgame.com, "Promotion card" series, checked Sep 2026):
 * - P-001–P-039 are all Block 1, and every P number from P-041 up is Block 2 or later;
 * - a promo reprint of a set card is Block 1 exactly when that number comes from a Block 1 set (46 of 46 listed).
 * The one exception Bandai lists, one of the ST13-003 Luffy leader promos, can't be told apart from its other
 * printings in this data, so it isn't treated as Block 1.
 */
export function isBlockOnePromo(sourceId: string): boolean {
  const promoNumber = /^P-(\d+)$/.exec(sourceId)
  if (promoNumber) return Number(promoNumber[1]) <= 39
  return BLOCK_ONE_NUMBER.test(sourceId)
}

/**
 * A One Piece promo that's legal in any format that limits sets (Standard): legality there follows the block icon,
 * and only Block 1 has rotated out. Worked out from the card rather than stored with it, so cards synced before this
 * rule existed don't need re-syncing. Next rotation (April 2027, Block 2) means extending isBlockOnePromo.
 */
export function isRotationLegalPromo(card: Card): boolean {
  return card.gameId === 'onepiece' && card.setId === PROMO_SET_ID && !isBlockOnePromo(card.sourceId)
}
