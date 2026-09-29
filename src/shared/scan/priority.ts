/**
 * Which detected text lines to read first. Reading a line is the scanner's slowest step, and most of a
 * card's lines are rules text that never decides anything; the name (big print), the collector code
 * and set (a thin band along the bottom) and the card type (top or bottom band) are what identify it.
 * The scanner reads these first and only reads the rest when they weren't enough.
 */

export interface LineShape {
  /** Middle of the line, as a fraction of the image height (0 = top). */
  cy: number
  /** Height of the text, as a fraction of the image height. */
  textHeight: number
  /** Width of the line, as a fraction of the image width. */
  width: number
}

/** Indices of the lines worth reading first, most useful first. */
export function firstPass(lines: readonly LineShape[], maxLines = 10): number[] {
  if (lines.length <= maxLines) return lines.map((_, i) => i)
  const heights = lines.map((l) => l.textHeight).sort((a, b) => b - a)
  // "Big" = among the few tallest lines on the card and close to the tallest: that's where names are
  // printed. (Rules text is often the 5th-tallest size too, so rank alone isn't enough.)
  const bigCut = Math.max(heights[Math.min(4, heights.length - 1)] * 0.98, heights[0] * 0.7)
  const scored = lines.map((l, i) => {
    let score = l.textHeight / heights[0]
    if (l.textHeight >= bigCut) score += 1
    // Codes are short; the long lines along the edges are copyright and artist credits.
    const short = l.width <= 0.45 || l.textHeight >= bigCut
    if (l.cy > 0.82 && short) score += 0.9 // collector number, set code, passcode, One Piece name/type
    else if (l.cy < 0.16 && short) score += 0.7 // Magic / Pokémon / Yu-Gi-Oh! name and type
    // Long lines in the middle are rules text: the costliest to read and the least useful.
    if (l.cy >= 0.16 && l.cy <= 0.82 && l.width > 0.4 && l.textHeight < bigCut) score -= 0.8
    return { i, score }
  })
  // Rules text never goes in the first pass, even to fill a spare slot: it's the costliest to read.
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxLines)
    .map((s) => s.i)
}
