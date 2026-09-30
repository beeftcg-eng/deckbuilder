import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { renderPackOpeningImage } from '../lib/packOpeningImage'
import { openingSummaryText, type PackOpening } from '../shared/packOpenings'
import { dataUrlBytes, imageExtension } from '../shared/exportImage'
import type { Card } from '../shared/types'
import { t } from '../shared/i18n'

/** A file name from the opening's name: "Unleashed box" -> "Unleashed box.jpg". */
function fileName(opening: PackOpening, dataUrl: string): string {
  const base = opening.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'pack opening'
  return `${base}.${imageExtension(dataUrl)}`
}

/** Shares a pack opening: a picture (packOpeningImage.ts) to save or send, or the same as text. */
export function PackShareModal(props: { opening: PackOpening; lookup: (cardId: string) => Card | undefined; date: string; onClose: () => void }) {
  const { opening, lookup, date, onClose } = props
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  // Drawn once, when the dialog opens: it's what you came for.
  useEffect(() => {
    let cancelled = false
    renderPackOpeningImage(opening, lookup, date)
      .then(async (dataUrl) => {
        if (cancelled) return
        setImageDataUrl(dataUrl)
        // The phone's share sheet takes the picture itself, where the browser can share files.
        const blob = await (await fetch(dataUrl)).blob()
        const candidate = new File([blob], fileName(opening, dataUrl), { type: blob.type })
        if (!cancelled && typeof navigator.canShare === 'function' && navigator.canShare({ files: [candidate] })) setFile(candidate)
      })
      .catch((err) => !cancelled && setImageError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a snapshot of the opening as the dialog opened
  }, [])

  async function copyText() {
    await window.api.clipboard.writeText(openingSummaryText(opening, lookup, date))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function shareFile() {
    if (!file) return
    try {
      await navigator.share({ files: [file], title: opening.name })
    } catch {
      // Dismissing the share sheet rejects; nothing to do.
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.packs.shareHeading}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <div className="export-actions">
          {file && (
            <button className="btn btn-primary" onClick={() => void shareFile()}>
              {t.packs.shareNative}
            </button>
          )}
          {imageDataUrl && (
            <button className={file ? 'btn' : 'btn btn-primary'} onClick={() => void window.api.exportSaveImage(imageDataUrl, fileName(opening, imageDataUrl))}>
              {t.exportCommon.saveImage((dataUrlBytes(imageDataUrl) / 1048576).toFixed(1))}
            </button>
          )}
          <button className="btn" onClick={() => void copyText()}>
            {copied ? t.common.copied : t.packs.copySummary}
          </button>
        </div>
        {imageError && <div className="sync-error">{t.exportCommon.imageFailed(imageError)}</div>}
        {!imageDataUrl && !imageError && <div className="text-dim">{t.packs.rendering}</div>}
        {imageDataUrl && (
          <div className="image-preview">
            <img src={imageDataUrl} alt={t.packs.imageAlt} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
