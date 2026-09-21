import { useState } from 'react'
import type { Card, Deck, Format } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import { buildExportText } from '../shared/export'
import { renderDeckImage } from '../lib/deckImage'
import { dataUrlBytes, imageExtension } from '../shared/exportImage'

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
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [generatingImage, setGeneratingImage] = useState(false)

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

  async function handleGenerateImage() {
    setGeneratingImage(true)
    setImageError(null)
    try {
      const dataUrl = await renderDeckImage(deck, adapter, cardsById)
      setImageDataUrl(dataUrl)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingImage(false)
    }
  }

  async function handleSaveImage() {
    if (!imageDataUrl) return
    await window.api.exportSaveImage(imageDataUrl, `${deck.name.replace(/[^a-z0-9-_ ]/gi, '_')}.${imageExtension(imageDataUrl)}`)
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
          <button className="btn" onClick={handleGenerateImage} disabled={generatingImage}>
            {generatingImage ? 'Rendering image…' : 'Export as image'}
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
        {imageError && <div className="sync-error">Image render failed: {imageError}</div>}
        {imageDataUrl && (
          <div className="image-preview">
            <img src={imageDataUrl} alt={`${deck.name} deck image`} />
            <button className="btn btn-primary" onClick={handleSaveImage}>
              Save image (.jpg, {(dataUrlBytes(imageDataUrl) / 1048576).toFixed(1)} MB)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
