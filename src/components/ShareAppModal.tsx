import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { SHARE_BASE_URL } from '../shared/deckShare'
import { qrPath } from '../lib/qrCode'
import { t } from '../shared/i18n'

/** The phone app's own address: what a friend opens to get the app. */
const APP_URL = SHARE_BASE_URL

/** Quiet zone around the code, in modules: scanners need the white border. */
const MARGIN = 4

/**
 * "Share the app" (phone app): a QR code of the app's link for a friend to scan with their camera, plus the
 * link to copy or send through the phone's share sheet. Word of mouth is how the app spreads.
 */
export function ShareAppModal({ onClose }: { onClose: () => void }) {
  const { size, path } = useMemo(() => qrPath(APP_URL), [])
  const [copied, setCopied] = useState(false)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    await window.api.clipboard.writeText(APP_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: 'Beef’s Brewhouse', text: t.shareApp.shareText, url: APP_URL })
    } catch {
      // Dismissing the share sheet rejects; nothing to do.
    }
  }

  const box = size + MARGIN * 2
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal share-app-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>{t.shareApp.title}</span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <p className="share-intro">{t.shareApp.intro}</p>
        {/* Always black on white, whatever the theme: that's what camera apps read best. */}
        <svg className="share-app-qr" viewBox={`${-MARGIN} ${-MARGIN} ${box} ${box}`} shapeRendering="crispEdges" role="img" aria-label={t.shareApp.qrLabel}>
          <rect x={-MARGIN} y={-MARGIN} width={box} height={box} fill="#fff" />
          <path d={path} fill="#000" />
        </svg>
        <p className="text-dim share-app-hint">{t.shareApp.hint}</p>
        <input className="share-link" readOnly value={APP_URL} onFocus={(e) => e.currentTarget.select()} />
        <div className="share-actions">
          <button className="btn btn-primary" onClick={copy}>
            {copied ? t.common.copied : t.common.copyLink}
          </button>
          {canNativeShare && (
            <button className="btn" onClick={nativeShare}>
              {t.share.shareVia}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
