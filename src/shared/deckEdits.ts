/**
 * Returns `entries` with one item's quantity set. An existing item keeps its
 * position (so a deck entry doesn't jump to the bottom of its zone each time
 * you click +/−, which made a second click land on a different card); a new
 * one is appended; a quantity of 0 or less removes it.
 */
export function withQuantity<T extends { quantity: number }>(entries: T[], matches: (entry: T) => boolean, create: () => T, quantity: number): T[] {
  if (quantity <= 0) return entries.filter((e) => !matches(e))
  const index = entries.findIndex(matches)
  if (index === -1) return [...entries, { ...create(), quantity }]
  return entries.map((e, i) => (i === index ? { ...e, quantity } : e))
}
