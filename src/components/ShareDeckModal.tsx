import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../state/useAppStore'
import { isNotSyncedError, shareUrl } from '../shared/deckShare'
import type { Deck } from '../shared/types'
import { t } from '../shared/i18n'
import { lazyModal } from './lazyModal'

const PawmodoroAccountModal = lazyModal(() => import('./PawmodoroAccountModal'), 'PawmodoroAccountModal')

/** Makes, shows and revokes a deck's share link (see deckShare.ts). */
export function ShareDeckModal({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const connected = useAppStore((s) => s.pawmodoroConfig.connected)
  const setDeckShareToken = useAppStore((s) => s.setDeckShareToken)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const link = deck.shareToken ? shareUrl(deck.shareToken) : null
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function describe(err: unknown): string {
    return isNotSyncedError(err) ? t.share.notSynced : t.share.failed(err instanceof Error ? err.message : String(err))
  }

  async function create() {
    setBusy(true)
    setMessage(null)
    try {
      const token = await window.api.pawmodoro.shareDeck(deck.id)
      await setDeckShareToken(deck.id, token)
    } catch (err) {
      setMessage(describe(err))
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    if (!confirm(t.share.stopConfirm)) return
    setBusy(true)
    setMessage(null)
    try {
      await window.api.pawmodoro.unshareDeck(deck.id)
      await setDeckShareToken(deck.id, null)
      setMessage(t.share.stopped)
    } catch (err) {
      setMessage(describe(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    await window.api.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function nativeShare() {
    if (!link) return
    try {
      await navigator.share({ title: deck.name, url: link })
    } catch {
      // Dismissing the share sheet rejects; nothing to do.
    }
  }

  // The account dialog sits beside the overlay, not inside it: React bubbles events through portals,
  // so a click in it would otherwise reach this overlay and close the share dialog too.
  if (showAccount) return <PawmodoroAccountModal onClose={() => setShowAccount(false)} />

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span>
            {t.share.title}: {deck.name}
          </span>
          <button className="btn" onClick={onClose}>
            {t.common.close}
          </button>
        </div>
        <p className="share-intro">{t.share.intro}</p>

        {link ? (
          <>
            <input className="share-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <div className="share-actions">
              <button className="btn btn-primary" onClick={copy}>
                {copied ? t.share.copied : t.share.copy}
              </button>
              {canNativeShare && (
                <button className="btn" onClick={nativeShare}>
                  {t.share.shareVia}
                </button>
              )}
              {connected && (
                <button className="btn btn-danger" disabled={busy} onClick={stop}>
                  {t.share.stop}
                </button>
              )}
            </div>
          </>
        ) : connected ? (
          <div className="share-actions">
            <button className="btn btn-primary" disabled={busy} onClick={create}>
              {busy ? t.share.creating : t.share.create}
            </button>
          </div>
        ) : (
          <>
            <p className="text-dim">{t.share.needAccount}</p>
            <div className="share-actions">
              <button className="btn btn-primary" onClick={() => setShowAccount(true)}>
                {t.share.logIn}
              </button>
            </div>
          </>
        )}
        {message && <p className="share-message">{message}</p>}
      </div>
    </div>,
    document.body,
  )
}
