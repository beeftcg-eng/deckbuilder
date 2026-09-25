import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card, Deck, Format } from '../shared/types'
import { getAdapter } from '../shared/games/registry'
import { buildExportText } from '../shared/export'
import { renderDeckImage } from '../lib/deckImage'
import { dataUrlBytes, imageExtension } from '../shared/exportImage'
import { t } from '../shared/i18n'

interface Props {
  deck: Deck
  format: Format
  cardsById: Map<string, Card>
  onClose: () => void
}

/** The Electron app (which can read Yu-Gi-Oh images from its own cache) rather than the phone/web app. */
function isDesktopApp(): boolean {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
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
  const [imageNote, setImageNote] = useState<string | null>(null)
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
    setImageNote(null)
    try {
      const { dataUrl, missingImages } = await renderDeckImage(deck, adapter, cardsById)
      setImageDataUrl(dataUrl)
      setImageNote(
        missingImages === 0
          ? null
          : t.exportDeck.missingImages(missingImages) + (deck.gameId === 'yugioh' && !isDesktopApp() ? t.exportDeck.ygoPhoneNote : ''),
      )
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

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.exportDeck.title(deck.name)}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <textarea className="export-textarea" readOnly value={text} />
        <div className="export-actions">
          <button className="btn" onClick={handleCopy}>
            {copied ? t.common.copied : t.exportCommon.copyToClipboard}
          </button>
          <button className="btn" onClick={handleSaveFile}>
            {t.exportCommon.saveTxt}
          </button>
          <button className="btn btn-primary" onClick={handlePaste} disabled={pasting}>
            {pasting ? t.exportCommon.uploading : t.exportCommon.pasteLink}
          </button>
          <button className="btn" onClick={handleGenerateImage} disabled={generatingImage}>
            {generatingImage ? t.exportCommon.rendering : t.exportCommon.exportImage}
          </button>
        </div>
        {pasteUrl && (
          <div className="paste-result">
            <input readOnly value={pasteUrl} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn" onClick={() => window.api.clipboard.writeText(pasteUrl)}>
              {t.common.copyLink}
            </button>
            <button className="btn" onClick={() => window.api.system.openExternal(pasteUrl)}>
              {t.common.open}
            </button>
          </div>
        )}
        {pasteError && <div className="sync-error">{t.exportCommon.uploadFailed(pasteError)}</div>}
        {imageError && <div className="sync-error">{t.exportCommon.imageFailed(imageError)}</div>}
        {imageNote && <div className="text-dim">{imageNote}</div>}
        {imageDataUrl && (
          <div className="image-preview">
            <img src={imageDataUrl} alt={t.exportDeck.imageAlt(deck.name)} />
            <button className="btn btn-primary" onClick={handleSaveImage}>
              {t.exportCommon.saveImage((dataUrlBytes(imageDataUrl) / 1048576).toFixed(1))}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
