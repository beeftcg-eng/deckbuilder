import { useState } from 'react'
import type { Card, Deck, Format } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import { buildExportText } from '../shared/export'

interface Props {
  deck: Deck
  format: Format
  cardsById: Map<string, Card>
  onClose: () => void
}

export function ExportModal({ deck, format, cardsById, onClose }: Props) {
  const adapter = getAdapter(deck.gameId)
  const text = buildExportText(deck, adapter, format.label, cardsById)
  const [pasteUrl, setPasteUrl] = useState<string | null>(null)
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    window.api.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handlePaste() {
    setPasting(true)
    setPasteError(null)
    try {
      const url = await window.api.exportPaste(text)
      setPasteUrl(url)
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : String(err))
    } finally {
      setPasting(false)
    }
  }

  async function handleSaveFile() {
    await window.api.exportSaveFile(text, `${deck.name.replace(/[^a-z0-9-_ ]/gi, '_')}.txt`)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>Export "{deck.name}"</span>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <textarea className="export-textarea" readOnly value={text} />
        <div className="export-actions">
          <button className="btn" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
          <button className="btn" onClick={handleSaveFile}>
            Save as .txt
          </button>
          <button className="btn btn-primary" onClick={handlePaste} disabled={pasting}>
            {pasting ? 'Uploading…' : 'Get shareable paste link'}
          </button>
        </div>
        {pasteUrl && (
          <div className="paste-result">
            <input readOnly value={pasteUrl} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn" onClick={() => window.api.clipboard.writeText(pasteUrl)}>
              Copy link
            </button>
            <button className="btn" onClick={() => window.api.system.openExternal(pasteUrl)}>
              Open
            </button>
          </div>
        )}
        {pasteError && <div className="sync-error">Upload failed: {pasteError}</div>}
      </div>
    </div>
  )
}
