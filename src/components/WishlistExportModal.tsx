import { useState } from 'react'
import { createPortal } from 'react-dom'
import { buildWishlistExportText, type ResolvedWishlistEntry } from '../shared/export'
import { renderWishlistImage } from '../lib/wishlistImage'
import { dataUrlBytes, imageExtension } from '../shared/exportImage'
import { t } from '../shared/i18n'

interface Props {
  entries: ResolvedWishlistEntry[]
  onClose: () => void
}

export function WishlistExportModal({ entries, onClose }: Props) {
  const text = buildWishlistExportText(entries)
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
    await window.api.exportSaveFile(text, 'wishlist.txt')
  }

  async function handleGenerateImage() {
    setGeneratingImage(true)
    setImageError(null)
    try {
      const dataUrl = await renderWishlistImage(entries)
      setImageDataUrl(dataUrl)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err))
    } finally {
      setGeneratingImage(false)
    }
  }

  async function handleSaveImage() {
    if (!imageDataUrl) return
    await window.api.exportSaveImage(imageDataUrl, `wishlist.${imageExtension(imageDataUrl)}`)
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.wishlistExport.title}</span>
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
        {imageDataUrl && (
          <div className="image-preview">
            <img src={imageDataUrl} alt={t.wishlistExport.imageAlt} />
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
