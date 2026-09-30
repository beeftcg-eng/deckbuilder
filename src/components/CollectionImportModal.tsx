import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { importCollectionCsv } from '../shared/collectionImport'
import type { GameId } from '../shared/types'
import { t } from '../shared/i18n'
import { Rich } from './Rich'

const MAX_UNMATCHED_SHOWN = 8

/** Adds the cards from another app's collection CSV (see shared/collectionImport.ts) to your collection. */
export function CollectionImportModal({ gameId, onClose, onImported }: { gameId: GameId; onClose: () => void; onImported: (copies: number) => void }) {
  const adapter = getAdapter(gameId)
  const catalog = useAppStore((s) => s.catalogs[gameId])
  const collection = useAppStore((s) => s.collection)
  const addToCollection = useAppStore((s) => s.addToCollection)
  const fileInput = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cards = catalog?.cards
  // The collection is read once per file, so importing doesn't re-match every row.
  const [collectionAtOpen] = useState(collection)
  const result = useMemo(
    () => (cards && text.trim() ? importCollectionCsv(text, gameId, cards, { owned: (card) => collectionAtOpen[card.id] ?? 0 }) : null),
    [text, gameId, cards, collectionAtOpen],
  )

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setError(null)
    try {
      setText(await file.text())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleImport() {
    if (!result || result.copies === 0) return
    setImporting(true)
    setError(null)
    try {
      const items = result.items.map(({ card, quantity }) => ({ cardId: card.id, quantity }))
      const added = await addToCollection(items)
      useAppStore.getState().recordCollectionBatch(gameId, 'import', items)
      onImported(added)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.collectionImport.title(adapter.shortName)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>

        {!cards || cards.length === 0 ? (
          <div className="text-dim">{t.collection.noData(adapter.shortName)}</div>
        ) : (
          <>
            <div className="text-dim">
              <Rich text={t.collectionImport.intro} />
            </div>
            <div>
              <input ref={fileInput} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => void chooseFile(e.target.files?.[0])} />
              <button className="btn" onClick={() => fileInput.current?.click()}>
                {t.collectionImport.chooseFile}
              </button>
            </div>
            <textarea className="export-textarea" placeholder={t.collectionImport.placeholder} value={text} onChange={(e) => setText(e.target.value)} />

            {result && (
              <div className="import-summary">
                {!result.recognised ? (
                  <div className="sync-error">{t.collectionImport.noHeader}</div>
                ) : (
                  <>
                    <div>
                      {result.source && <span className="text-dim">{t.collectionImport.source(result.source)} </span>}
                      <Rich text={t.collectionImport.found(result.copies, result.items.length)} />
                    </div>
                    {result.byNameCopies > 0 && <div className="text-dim">{t.collectionImport.byName(result.byNameCopies)}</div>}
                    {result.otherGameRows > 0 && <div className="text-dim">{t.collectionImport.otherGame(result.otherGameRows)}</div>}
                    {result.unmatched.length > 0 && (
                      <>
                        <div className="sync-error">{t.collectionImport.unmatched(result.unmatched.length)}</div>
                        <ul className="import-unmatched">
                          {result.unmatched.slice(0, MAX_UNMATCHED_SHOWN).map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                          {result.unmatched.length > MAX_UNMATCHED_SHOWN && <li>{t.importDeck.andMore(result.unmatched.length - MAX_UNMATCHED_SHOWN)}</li>}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="import-fields">
              <button className="btn btn-primary" disabled={!result || result.copies === 0 || importing} onClick={handleImport}>
                {importing ? t.collectionImport.adding : t.collectionImport.add(result?.copies ?? 0)}
              </button>
            </div>
            {error && <div className="sync-error">{t.collectionImport.failed(error)}</div>}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
