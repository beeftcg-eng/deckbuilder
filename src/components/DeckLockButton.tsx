import { useAppStore } from '../state/useAppStore'
import type { Deck } from '../shared/types'

/** Locks a deck so it can't be changed (or deleted) by accident, and unlocks it again. */
export function DeckLockButton({ deck, compact = false }: { deck: Deck; compact?: boolean }) {
  const setDeckLocked = useAppStore((s) => s.setDeckLocked)
  const locked = Boolean(deck.locked)
  const title = locked ? 'Locked: this deck can’t be changed or deleted. Click to unlock it.' : 'Lock this deck so it can’t be changed or deleted by accident'
  return (
    <button
      className={`${compact ? 'deck-row-delete lock-mini' : 'btn'} ${locked ? 'lock-on' : ''}`}
      aria-pressed={locked}
      aria-label={locked ? 'Unlock deck' : 'Lock deck'}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        void setDeckLocked(deck.id, !locked)
      }}
    >
      {compact ? (locked ? '🔒' : '🔓') : locked ? '🔒 Locked' : '🔓 Lock'}
    </button>
  )
}
