import { useMemo, useState } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { parseDecklistText } from '../shared/importDeck'
import type { GameId } from '../shared/types'

const MAX_UNMATCHED_SHOWN = 8

export function ImportDeckModal({ gameId, onClose }: { gameId: GameId; onClose: () => void }) {
  const adapter = getAdapter(gameId)
  const cardsById = useCardsById(gameId)
  const formats = useAppStore((s) => s.formats[gameId]) ?? adapter.defaultFormats
  const importDeck = useAppStore((s) => s.importDeck)

  const [text, setText] = useState('')
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [formatDraft, setFormatDraft] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(() => parseDecklistText(text, adapter, cardsById), [text, adapter, cardsById])
  const catalogReady = cardsById.size > 0

  const name = nameDraft ?? parsed.name ?? 'Imported deck'
  const detectedFormat = formats.find((f) => f.label === parsed.formatLabel)
  const formatId = formatDraft ?? detectedFormat?.id ?? formats[0]?.id ?? ''

  async function handleImport() {
    setImporting(true)
    setError(null)
    try {
      await importDeck(gameId, parsed, name.trim() || 'Imported deck', formatId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Import {adapter.shortName} decklist</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
        </div>

        {!catalogReady ? (
          <div className="text-dim">No {adapter.shortName} card data yet — use “Sync card data” in the sidebar first, then import.</div>
        ) : (
          <>
            <textarea
              className="export-textarea"
              autoFocus
              placeholder={'Paste a decklist — this app\'s export, or a list from a deck site:\n\n4x OP01-006 Otama\n3 Professor\'s Research SVI 189'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />

            {text.trim() && (
              <div className="import-summary">
                <div>
                  Recognised <b>{parsed.matchedCopies}</b> card{parsed.matchedCopies === 1 ? '' : 's'}
                  {parsed.unmatched.length > 0 && <span className="sync-error"> · {parsed.unmatched.length} line(s) not matched</span>}
                </div>
                {parsed.unmatched.length > 0 && (
                  <ul className="import-unmatched">
                    {parsed.unmatched.slice(0, MAX_UNMATCHED_SHOWN).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                    {parsed.unmatched.length > MAX_UNMATCHED_SHOWN && <li>…and {parsed.unmatched.length - MAX_UNMATCHED_SHOWN} more</li>}
                  </ul>
                )}
              </div>
            )}

            <div className="import-fields">
              <input value={name} onChange={(e) => setNameDraft(e.target.value)} placeholder="Deck name" />
              <select value={formatId} onChange={(e) => setFormatDraft(e.target.value)}>
                {formats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" disabled={parsed.matchedCopies === 0 || importing} onClick={handleImport}>
                {importing ? 'Importing…' : 'Import deck'}
              </button>
            </div>
            {error && <div className="sync-error">Couldn't import: {error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
