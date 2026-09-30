import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { rulesForFormat } from '../shared/games/rules'
import { compareDecks } from '../shared/deckCompare'
import { listKey } from '../shared/deckHistory'
import type { Card, Deck, DeckVersion } from '../shared/types'
import { getLanguage, t } from '../shared/i18n'
import { DeckDiffList } from './DeckDiffList'

function when(version: DeckVersion): string {
  return version.name ?? new Date(version.at).toLocaleString(getLanguage(), { dateStyle: 'medium', timeStyle: 'short' })
}

/** A deck's earlier lists (shared/deckHistory.ts): what changed since each, and going back to one. */
export function DeckHistoryModal({ deck, cardsById, onClose }: { deck: Deck; cardsById: Map<string, Card>; onClose: () => void }) {
  const { saveDeckVersion, restoreDeckVersion, renameDeckVersion, deleteDeckVersion } = useAppStore.getState()
  const versions = useMemo(() => [...(deck.versions ?? [])].reverse(), [deck.versions])
  const [selectedId, setSelectedId] = useState(versions[0]?.id ?? null)
  const [name, setName] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const selected = versions.find((v) => v.id === selectedId) ?? versions[0]
  const rules = rulesForFormat(getAdapter(deck.gameId), deck.formatId)
  const diff = useMemo(() => (selected ? compareDecks(selected, deck, rules, cardsById) : null), [selected, deck, rules, cardsById])
  const currentSaved = versions[0] != null && listKey(versions[0]) === listKey(deck)

  async function saveNow() {
    if (currentSaved && !name.trim()) {
      setFlash(t.history.savedSame)
      return
    }
    await saveDeckVersion(deck.id, name)
    setName('')
    setFlash(null)
  }

  async function restore(version: DeckVersion) {
    if (!confirm(t.history.restoreConfirm(when(version)))) return
    await restoreDeckVersion(version.id)
    onClose()
  }

  function rename(version: DeckVersion) {
    const next = prompt(t.history.renamePrompt, version.name ?? '')
    if (next != null) void renameDeckVersion(deck.id, version.id, next)
  }

  function remove(version: DeckVersion) {
    if (confirm(t.history.deleteConfirm)) void deleteDeckVersion(deck.id, version.id)
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal compare-modal history-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t.history.title(deck.name)}>
        <div className="modal-header">
          <span>{t.history.title(deck.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <p className="text-dim">{versions.length ? t.history.intro : t.history.none}</p>

        <form
          className="history-save"
          onSubmit={(e) => {
            e.preventDefault()
            void saveNow()
          }}
        >
          <input className="search-input" value={name} maxLength={80} placeholder={t.history.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-primary" type="submit">
            {t.history.saveNow}
          </button>
        </form>
        {flash && <div className="text-dim">{flash}</div>}

        {selected && diff && (
          <div className="history-body">
            <ul className="history-list">
              {versions.map((v) => (
                <li key={v.id}>
                  <button className={v.id === selected.id ? 'btn btn-primary' : 'btn'} aria-pressed={v.id === selected.id} onClick={() => setSelectedId(v.id)}>
                    <span>{when(v)}</span>
                    {v.name ? (
                      <span className="text-dim">{new Date(v.at).toLocaleDateString(getLanguage())}</span>
                    ) : (
                      <span className="text-dim">{t.history.auto}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className="history-detail">
              <div className="compare-summary">
                <span>
                  {t.history.changesFrom(when(selected))}{' '}
                  {diff.added || diff.removed ? (
                    <>
                      <b className="compare-in">+{diff.added}</b> <b className="compare-out">−{diff.removed}</b>
                    </>
                  ) : null}
                </span>
                <span className="compare-tools">
                  <button className="btn" disabled={Boolean(deck.locked)} title={deck.locked ? t.history.locked : undefined} onClick={() => void restore(selected)}>
                    {t.history.restore}
                  </button>
                  <button className="btn" onClick={() => rename(selected)}>
                    {t.history.rename}
                  </button>
                  <button className="btn" onClick={() => remove(selected)}>
                    {t.history.delete}
                  </button>
                </span>
              </div>
              <DeckDiffList diff={diff} />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
