import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { allTags, parseTags, tagsOf } from '../shared/deckTags'
import type { Card, Deck } from '../shared/types'
import { t } from '../shared/i18n'

/** Your tags on one card of a deck ("ramp", "removal"), with the deck's other tags one tap away (shared/deckTags.ts). */
export function CardTagsModal({ deck, card, onClose }: { deck: Deck; card: Card; onClose: () => void }) {
  const [text, setText] = useState(() => tagsOf(deck, card).join(', '))
  const current = parseTags(text)
  const suggestions = allTags(deck).filter((tag) => !current.some((c) => c.toLowerCase() === tag.toLowerCase()))

  async function save() {
    await useAppStore.getState().setCardTags(deck.id, card, parseTags(text))
    onClose()
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal card-tags-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.tags.title(card.name)}>
        <div className="modal-header">
          <span>{t.tags.title(card.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
        <form
          className="card-tags-form"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input className="search-input" autoFocus value={text} placeholder={t.tags.placeholder} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            {t.tags.save}
          </button>
        </form>
        {suggestions.length > 0 && (
          <div className="card-tags-suggestions">
            <span className="text-dim">{t.tags.used}</span>
            {suggestions.slice(0, 20).map((tag) => (
              <button key={tag} className="stat-chip" onClick={() => setText(current.length ? `${current.join(', ')}, ${tag}` : tag)}>
                + {tag}
              </button>
            ))}
          </div>
        )}
        <p className="text-dim">{t.tags.help}</p>
      </div>
    </div>,
    document.body,
  )
}
