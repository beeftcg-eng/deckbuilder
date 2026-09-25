import { useAppStore } from '../state/useAppStore'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'

/** Locks a deck so it can't be changed (or deleted) by accident, and unlocks it again. */
export function DeckLockButton({ deck, compact = false }: { deck: Deck; compact?: boolean }) {
  const setDeckLocked = useAppStore((s) => s.setDeckLocked)
  const locked = Boolean(deck.locked)
  const title = locked ? t.deckLock.lockedTitle : t.deckLock.unlockedTitle
  return (
    <button
      className={`${compact ? 'deck-row-delete lock-mini' : 'btn'} ${locked ? 'lock-on' : ''}`}
      aria-pressed={locked}
      aria-label={locked ? t.deckLock.unlockAria : t.deckLock.lockAria}
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        void setDeckLocked(deck.id, !locked)
      }}
    >
      {compact ? (locked ? '🔒' : '🔓') : locked ? t.deckLock.locked : t.deckLock.lock}
    </button>
  )
}
