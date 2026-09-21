import { useMemo, useState } from 'react'
import { useAppStore, useCardsById } from '../state/useAppStore'
import { getAdapter } from '../shared/games/registry'
import { detectFormatFromHeadings, parseDecklistText } from '../shared/importDeck'
import { isCardLegalInFormat } from '../shared/legality'
import type { PrintingPrefs } from '../shared/printings'
import type { GameId } from '../shared/types'

const MAX_UNMATCHED_SHOWN = 8

export function ImportDeckModal({ gameId, onClose }: { gameId: GameId; onClose: () => void }) {
  const adapter = getAdapter(gameId)
  const cardsById = useCardsById(gameId)
  const formats = useAppStore((s) => s.formats[gameId]) ?? adapter.defaultFormats
  const importDeck = useAppStore((s) => s.importDeck)
  const collection = useAppStore((s) => s.collection)

  const [text, setText] = useState('')
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [formatDraft, setFormatDraft] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultFormatId = formats[0]?.id ?? ''
  // When a list gives only a card's name, use the printing you own, then one that's legal in the chosen format,
  // then a regular one over alternate art / a promo (see shared/printings.ts).
  const prefsFor = (id: string): PrintingPrefs => {
    const format = formats.find((f) => f.id === id)
    return { owned: (card) => collection[card.id] ?? 0, legal: format ? (card) => isCardLegalInFormat(card, format).legal : undefined }
  }
  // A game's deck shape can depend on its format, so the text is parsed for the format that ends up chosen:
  // once with the default (which is where this app's own export header names its format), then again if that differs.
  const firstPass = useMemo(() => parseDecklistText(text, adapter, cardsById, defaultFormatId, prefsFor(defaultFormatId)), [text, adapter, cardsById, defaultFormatId, collection, formats]) // eslint-disable-line react-hooks/exhaustive-deps
  const detectedFormat = formats.find((f) => f.label === firstPass.formatLabel)
  const hintedFormatId = useMemo(() => detectFormatFromHeadings(text, adapter), [text, adapter])
  const formatId = formatDraft ?? detectedFormat?.id ?? hintedFormatId ?? defaultFormatId
  const parsed = useMemo(
    () => (formatId === defaultFormatId ? firstPass : parseDecklistText(text, adapter, cardsById, formatId, prefsFor(formatId))),
    [formatId, defaultFormatId, firstPass, text, adapter, cardsById, collection, formats], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const catalogReady = cardsById.size > 0

  const name = nameDraft ?? parsed.name ?? 'Imported deck'

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
              placeholder={'Paste a decklist — this app\'s export, or a list from a deck site:\n\n4x OP01-006 Otama\n3 Professor\'s Research SVI 189\n4 Lightning Bolt (2XM) 141'}
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
