/** Text helpers for matching OCR output (noisy, often missing spaces) against card data. */

/** Lowercase letters and digits only, accents dropped, runs of anything else collapsed to one space. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** normalize() without spaces: OCR often drops or adds them, so names are compared this way. */
export function squash(text: string): string {
  return normalize(text).replace(/ /g, '')
}

/** Edit distance, giving up (returning max + 1) once it can't come in under `max`. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = new Array<number>(b.length + 1)
  let cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    let rowMin = cur[0]
    const ca = a.charCodeAt(i - 1)
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    ;[prev, cur] = [cur, prev]
  }
  return prev[b.length]
}

/**
 * The smallest edit distance between `pattern` and any substring of `text` (Sellers' algorithm), for
 * finding a name inside a longer OCR line ("STAGE2Salamence" contains "salamence").
 */
export function substringDistance(pattern: string, text: string): number {
  if (!pattern) return 0
  let prev = new Array<number>(text.length + 1).fill(0)
  let cur = new Array<number>(text.length + 1)
  for (let i = 1; i <= pattern.length; i++) {
    cur[0] = i
    const cp = pattern.charCodeAt(i - 1)
    for (let j = 1; j <= text.length; j++) {
      const cost = cp === text.charCodeAt(j - 1) ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, cur] = [cur, prev]
  }
  let best = Infinity
  for (let j = 0; j <= text.length; j++) if (prev[j] < best) best = prev[j]
  return best
}

export function trigrams(text: string): string[] {
  const padded = `  ${text} `
  const out: string[] = []
  for (let i = 0; i + 3 <= padded.length; i++) out.push(padded.slice(i, i + 3))
  return out
}

/** Letters OCR commonly reads in place of digits (and the reverse), for codes and collector numbers. */
const AS_DIGIT: Record<string, string> = { o: '0', q: '0', d: '0', i: '1', l: '1', '|': '1', z: '2', s: '5', b: '8', g: '9', t: '7' }
const AS_LETTER: Record<string, string> = { '0': 'o', '1': 'i', '2': 'z', '5': 's', '8': 'b', '6': 'g', '7': 't' }

export function digitsFromOcr(text: string): string {
  return [...text.toLowerCase()].map((c) => AS_DIGIT[c] ?? c).join('')
}

export function lettersFromOcr(text: string): string {
  return [...text.toLowerCase()].map((c) => AS_LETTER[c] ?? c).join('')
}

/** "007" -> "7", "0019" -> "19"; keeps suffixes ("116a" stays "116a"). */
export function stripLeadingZeros(number: string): string {
  const stripped = number.replace(/^0+(?=\d)/, '')
  return stripped || number
}
