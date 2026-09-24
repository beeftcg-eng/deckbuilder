import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Card } from '../shared/types'

/** The card's picture as large as the window allows, with Copy image / Save image. */
export function CardImageViewer({ card, onClose }: { card: Card; onClose: () => void }) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const fileName = `${card.name} ${card.setCode}-${card.number}`.replace(/[\\/:*?"<>|]+/g, ' ').trim()

  async function withImage(action: (dataUrl: string) => Promise<unknown>, done: string) {
    if (!card.imageUrl) return
    setBusy(true)
    setStatus(null)
    try {
      await action(await window.api.images.fetchDataUri(card.imageUrl))
      setStatus(done)
    } catch {
      // On the phone app a Yu-Gi-Oh image can't be read back by the page (YGOPRODeck doesn't allow it),
      // but the browser's own long-press menu on the picture still copies and saves it.
      setStatus("Couldn't do that here. Press and hold (or right-click) the picture to copy or save it instead.")
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div
      className="image-viewer"
      role="dialog"
      aria-label={`${card.name}, enlarged`}
      onClick={(e) => {
        e.stopPropagation() // it sits inside the card details; a click here must not close those too
        onClose()
      }}
    >
      <div className="image-viewer-body" onClick={(e) => e.stopPropagation()}>
        {card.imageUrl ? <img src={card.imageUrl} alt={card.name} /> : <div className="card-tile-placeholder">{card.name}</div>}
        <div className="image-viewer-actions">
          <button className="btn btn-primary" disabled={busy || !card.imageUrl} onClick={() => withImage((d) => window.api.clipboard.writeImage(d), 'Copied — paste it anywhere.')}>
            Copy image
          </button>
          <button className="btn" disabled={busy || !card.imageUrl} onClick={() => withImage(async (d) => { if (await window.api.exportSaveImage(d, `${fileName}.jpg`)) setStatus('Saved.') }, '')}>
            Save image…
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {status && <span className="text-dim image-viewer-status">{status}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
