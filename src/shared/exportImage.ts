/**
 * Sizes for the exported deck / wishlist pictures.
 *
 * They are made to be sent in a chat app, where the whole deck should be readable at a glance and the file has to be
 * small: WhatsApp refuses anything over 16 MB, and the old export (a PNG of cards at up to 600 px wide, four to a row)
 * came out at tens of megabytes for a full deck.
 */

/** Width each card is drawn at (never enlarged past the card's own resolution). */
export const THUMB_WIDTH = 300
export const THUMB_GAP = 12
export const IMAGE_PADDING = 32

/** WhatsApp's cap is 16 MB; stay clear of it. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024

/** JPEG qualities tried in turn until the picture fits under the cap. */
export const JPEG_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5]

const MIN_PER_ROW = 4
const MAX_PER_ROW = 10
/** Cards are about 5:7, so this many-across gives a picture roughly 5:4 wide: the whole deck in one look, not a long scroll. */
const TARGET_ASPECT = 1.25
const CARD_ASPECT = 1.4

/** How many cards to put in a row for a picture holding `cardCount` different cards. */
export function columnsFor(cardCount: number): number {
  if (!(cardCount > 0)) return MIN_PER_ROW
  const columns = Math.round(Math.sqrt(cardCount * CARD_ASPECT * TARGET_ASPECT))
  return Math.min(MAX_PER_ROW, Math.max(MIN_PER_ROW, columns))
}

export function imageWidthFor(columns: number): number {
  return columns * THUMB_WIDTH + (columns - 1) * THUMB_GAP + 2 * IMAGE_PADDING
}

/** The decoded size, in bytes, of a `data:` URL's base64 payload. */
export function dataUrlBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.floor((payload.length * 3) / 4) - padding
}

/** The file extension for a picture's `data:` URL. */
export function imageExtension(dataUrl: string): 'jpg' | 'png' {
  return dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'
}
