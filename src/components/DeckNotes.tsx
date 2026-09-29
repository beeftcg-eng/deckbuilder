import { useState } from 'react'
import { useAppStore } from '../state/useAppStore'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'

/** A deck's own notes, under its header in the deck view: read, or edited in place. */
export function DeckNotes({ deck }: { deck: Deck }) {
  const setDeckNotes = useAppStore((s) => s.setDeckNotes)
  const [draft, setDraft] = useState<string | null>(null)
  const [open, setOpen] = useState(Boolean(deck.notes))
  const notes = deck.notes ?? ''

  async function save() {
    if (draft == null) return
    await setDeckNotes(deck.id, draft)
    setDraft(null)
    setOpen(true)
  }

  return (
    <section className="deck-notes">
      <div className="deck-notes-head">
        <button className="deck-notes-toggle" aria-expanded={open || draft != null} onClick={() => setOpen(!open)}>
          {t.deckNotes.title} <span className="text-dim">{open || draft != null ? '▾' : '▸'}</span>
        </button>
        {draft == null && (
          <button className="btn" onClick={() => setDraft(notes)}>
            {notes ? t.deckNotes.edit : t.deckNotes.add}
          </button>
        )}
      </div>
      {draft != null ? (
        <>
          <textarea
            className="deck-notes-text"
            autoFocus
            rows={Math.min(14, Math.max(4, draft.split('\n').length + 1))}
            placeholder={t.deckNotes.placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="deck-notes-actions">
            <span className="text-dim">{t.deckNotes.private}</span>
            <button className="btn" onClick={() => setDraft(null)}>
              {t.deckNotes.cancel}
            </button>
            <button className="btn btn-primary" onClick={() => void save()}>
              {t.deckNotes.save}
            </button>
          </div>
        </>
      ) : (
        open && (notes ? <div className="deck-notes-body">{notes}</div> : <div className="text-dim deck-notes-body">{t.deckNotes.empty}</div>)
      )}
    </section>
  )
}
