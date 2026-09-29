/**
 * Desktop keyboard shortcuts (App.tsx's handler): the card tile under the mouse registers what +
 * and − do to it, since a card browser has no "selected" card otherwise.
 */
export interface HoveredCard {
  inc: () => void
  dec: () => void
}

let hovered: { current: HoveredCard } | null = null

export function hoverCard(actions: { current: HoveredCard }): void {
  hovered = actions
}

export function unhoverCard(actions: { current: HoveredCard }): void {
  if (hovered === actions) hovered = null
}

export function hoveredCard(): HoveredCard | null {
  return hovered?.current ?? null
}

/** Whether a key press is someone typing (then letter shortcuts stay out of the way). */
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)
}
