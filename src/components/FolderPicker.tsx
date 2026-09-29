import { useMemo, useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import { deckFolders } from '../shared/deckFolders'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'

const NEW = '\u0000new'

/**
 * Which folder a deck is filed under (shared/deckFolders.ts), with a way to start a new one. The
 * new name is typed in place: Electron doesn't implement window.prompt().
 */
export function FolderPicker({ deck, compact = false }: { deck: Deck; compact?: boolean }) {
  const decks = useAppStore((s) => s.decks)
  const setDeckFolder = useAppStore((s) => s.setDeckFolder)
  const folders = useMemo(() => deckFolders(decks), [decks])
  const [naming, setNaming] = useState<string | null>(null)

  function save() {
    const name = naming?.trim()
    if (name) void setDeckFolder(deck.id, name)
    setNaming(null)
  }

  if (naming != null) {
    return (
      <form
        className={`folder-new ${compact ? 'compact' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          autoFocus
          value={naming}
          maxLength={60}
          placeholder={t.folders.prompt}
          aria-label={t.folders.prompt}
          onChange={(e) => setNaming(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') setNaming(null)
          }}
          onBlur={save}
        />
      </form>
    )
  }

  return (
    <select
      className={`folder-picker ${compact ? 'compact' : ''}`}
      value={deck.folder ?? ''}
      title={t.folders.title}
      aria-label={t.folders.label}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => (e.target.value === NEW ? setNaming('') : void setDeckFolder(deck.id, e.target.value))}
    >
      <option value="">📁 {t.folders.none}</option>
      {folders.map((f) => (
        <option key={f} value={f}>
          📁 {f}
        </option>
      ))}
      <option value={NEW}>{t.folders.newFolder}</option>
    </select>
  )
}
